require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(express.static(publicDir, { extensions: ["html"], maxAge: isProduction ? "1d" : 0 }));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} n'est pas configurÃ©e.`);
  return value;
}

function anonClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function db() { return serviceClient(); }

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function cleanText(value, max = 120) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v ? v.slice(0, max) : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || token.length < 20) return res.status(401).json({ error: "Authentification requise." });
    const { data, error } = await anonClient().auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Session invalide ou expirÃ©e." });
    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (error) {
    res.status(503).json({ error: "Service d'authentification indisponible." });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const { data, error } = await db().from("profiles").select("role").eq("id", req.user.id).maybeSingle();
    if (error || data?.role !== "admin") return res.status(403).json({ error: "AccÃ¨s administrateur requis." });
    next();
  } catch (error) {
    res.status(503).json({ error: "VÃ©rification administrateur indisponible." });
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "FOOT26",
    version: "2.0.0",
    configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
    time: new Date().toISOString()
  });
});

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 254)?.toLowerCase();
  const password = String(req.body.password || "");
  const fullName = cleanText(req.body.full_name, 120) || "Utilisateur";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Adresse email invalide." });
  if (password.length < 8) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractÃ¨res." });

  const { data, error } = await anonClient().auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user, session: data.session, message: data.session ? "Compte crÃ©Ã© et connectÃ©." : "Compte crÃ©Ã©. VÃ©rifiez votre email." });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 254)?.toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email et mot de passe obligatoires." });
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: "Email ou mot de passe incorrect." });
  res.json({ user: data.user, session: data.session });
}));

app.post("/api/auth/refresh", asyncRoute(async (req, res) => {
  const refreshToken = cleanText(req.body.refresh_token, 2048);
  if (!refreshToken) return res.status(400).json({ error: "Refresh token manquant." });
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return res.status(401).json({ error: "Session expirÃ©e. Reconnectez-vous." });
  res.json({ user: data.user, session: data.session });
}));

app.post("/api/auth/logout", requireAuth, (req, res) => res.json({ success: true }));

app.get("/api/profile", requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await db().from("profiles").select("id,full_name,role,created_at").eq("id", req.user.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Profil introuvable. ExÃ©cutez database/schema.sql." });
  res.json(data);
}));

async function dashboardData() {
  const c = db();
  const now = new Date().toISOString();
  const [teams, players, matches, standings] = await Promise.all([
    c.from("teams").select("id,name,city,logo_url,coach_id,coaches(id,first_name,last_name)").order("name"),
    c.from("players").select("id", { count: "exact", head: true }),
    c.from("matches").select("id,match_date,status,home_score,away_score,home:teams!matches_home_team_id_fkey(id,name),away:teams!matches_away_team_id_fkey(id,name),stadiums(name)").in("status", ["scheduled", "live"]).gte("match_date", now).order("match_date", { ascending: true }).limit(8),
    c.from("standings").select("*").order("points", { ascending: false }).order("goal_difference", { ascending: false }).order("goals_for", { ascending: false }).order("name")
  ]);
  const error = [teams, players, matches, standings].find(x => x.error);
  if (error) throw error.error;
  return { teams: teams.data || [], playerCount: players.count || 0, upcomingMatches: matches.data || [], standings: standings.data || [] };
}

app.get("/api/dashboard", asyncRoute(async (req, res) => res.json(await dashboardData())));

app.get("/api/teams", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("teams").select("id,name,city,logo_url,coach_id,coaches(id,first_name,last_name)").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/teams", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name, 100);
  if (!name) return res.status(400).json({ error: "Le nom de l'Ã©quipe est obligatoire." });
  const payload = { name, city: cleanText(req.body.city, 100), coach_id: isUuid(req.body.coach_id) ? req.body.coach_id : null, logo_url: cleanText(req.body.logo_url, 500) };
  const { data, error } = await db().from("teams").insert(payload).select("id,name,city,logo_url,coach_id,coaches(id,first_name,last_name)").single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/teams/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Identifiant d'Ã©quipe invalide." });
  const update = {};
  for (const key of ["name", "city", "logo_url"]) if (req.body[key] !== undefined) update[key] = cleanText(req.body[key], key === "logo_url" ? 500 : 100);
  if (req.body.coach_id !== undefined) update.coach_id = isUuid(req.body.coach_id) ? req.body.coach_id : null;
  if (!Object.keys(update).length) return res.status(400).json({ error: "Aucune modification." });
  const { data, error } = await db().from("teams").update(update).eq("id", req.params.id).select("id,name,city,logo_url,coach_id,coaches(id,first_name,last_name)").single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/teams/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Identifiant d'Ã©quipe invalide." });
  const { error } = await db().from("teams").delete().eq("id", req.params.id);
  if (error) return res.status(409).json({ error: "Impossible de supprimer cette Ã©quipe : elle est probablement utilisÃ©e par un match." });
  res.json({ success: true });
}));

app.get("/api/coaches", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("coaches").select("*").order("last_name").order("first_name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/coaches", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const first_name = cleanText(req.body.first_name, 80), last_name = cleanText(req.body.last_name, 80);
  if (!first_name || !last_name) return res.status(400).json({ error: "PrÃ©nom et nom obligatoires." });
  const { data, error } = await db().from("coaches").insert({ first_name, last_name, license_number: cleanText(req.body.license_number, 80) }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/coaches/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
  const update = {};
  for (const key of ["first_name", "last_name", "license_number"]) if (req.body[key] !== undefined) update[key] = cleanText(req.body[key], 80);
  const { data, error } = await db().from("coaches").update(update).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/coaches/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("coaches").delete().eq("id", req.params.id);
  if (error) return res.status(409).json({ error: "Impossible de supprimer cet entraÃ®neur s'il est affectÃ© Ã  une Ã©quipe." });
  res.json({ success: true });
}));

app.get("/api/players", asyncRoute(async (req, res) => {
  const search = cleanText(req.query.search, 80);
  let query = db().from("players").select("id,first_name,last_name,position,team_id,jersey_number,birth_date,teams(id,name)").order("last_name").order("first_name");
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/players", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const first_name = cleanText(req.body.first_name, 80), last_name = cleanText(req.body.last_name, 80);
  const team_id = req.body.team_id;
  const jersey = req.body.jersey_number === "" || req.body.jersey_number == null ? null : integer(req.body.jersey_number, { min: 0, max: 99 });
  if (!first_name || !last_name || !isUuid(team_id)) return res.status(400).json({ error: "PrÃ©nom, nom et Ã©quipe sont obligatoires." });
  if (req.body.jersey_number !== "" && req.body.jersey_number != null && jersey === null) return res.status(400).json({ error: "NumÃ©ro de maillot invalide." });
  const { data, error } = await db().from("players").insert({ first_name, last_name, position: cleanText(req.body.position, 50), team_id, jersey_number: jersey, birth_date: req.body.birth_date || null }).select("id,first_name,last_name,position,team_id,jersey_number,birth_date,teams(id,name)").single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/players/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Identifiant joueur invalide." });
  const update = {};
  for (const key of ["first_name", "last_name", "position", "birth_date"]) if (req.body[key] !== undefined) update[key] = cleanText(req.body[key], key === "position" ? 50 : 80);
  if (req.body.team_id !== undefined) { if (!isUuid(req.body.team_id)) return res.status(400).json({ error: "Ã‰quipe invalide." }); update.team_id = req.body.team_id; }
  if (req.body.jersey_number !== undefined) { const n = req.body.jersey_number === "" ? null : integer(req.body.jersey_number, { min: 0, max: 99 }); if (req.body.jersey_number !== "" && n === null) return res.status(400).json({ error: "NumÃ©ro invalide." }); update.jersey_number = n; }
  const { data, error } = await db().from("players").update(update).eq("id", req.params.id).select("id,first_name,last_name,position,team_id,jersey_number,birth_date,teams(id,name)").single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/players/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("players").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}));

function matchSelect() {
  return "id,match_date,status,home_score,away_score,home:teams!matches_home_team_id_fkey(id,name),away:teams!matches_away_team_id_fkey(id,name),stadiums(id,name,city),referees(id,first_name,last_name)";
}

app.get("/api/matches", asyncRoute(async (req, res) => {
  let query = db().from("matches").select(matchSelect()).order("match_date", { ascending: true });
  if (["scheduled", "live", "finished", "cancelled"].includes(req.query.status)) query = query.eq("status", req.query.status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/matches", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { home_team_id, away_team_id, stadium_id, referee_id } = req.body;
  const date = new Date(req.body.match_date);
  if (!isUuid(home_team_id) || !isUuid(away_team_id) || !Number.isFinite(date.getTime())) return res.status(400).json({ error: "Ã‰quipes et date valides obligatoires." });
  if (home_team_id === away_team_id) return res.status(400).json({ error: "Les deux Ã©quipes doivent Ãªtre diffÃ©rentes." });
  if (date.getTime() < Date.now() - 60000) return res.status(400).json({ error: "La date du match doit Ãªtre future." });
  const payload = { home_team_id, away_team_id, stadium_id: isUuid(stadium_id) ? stadium_id : null, referee_id: isUuid(referee_id) ? referee_id : null, match_date: date.toISOString(), status: "scheduled", home_score: 0, away_score: 0 };
  const { data, error } = await db().from("matches").insert(payload).select(matchSelect()).single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/matches/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Identifiant match invalide." });
  const update = {};
  for (const key of ["home_team_id", "away_team_id", "stadium_id", "referee_id"]) if (req.body[key] !== undefined) update[key] = req.body[key] && isUuid(req.body[key]) ? req.body[key] : null;
  if (req.body.match_date !== undefined) { const d = new Date(req.body.match_date); if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "Date invalide." }); update.match_date = d.toISOString(); }
  if (req.body.status !== undefined && ["scheduled", "live", "finished", "cancelled"].includes(req.body.status)) update.status = req.body.status; else if (req.body.status !== undefined) return res.status(400).json({ error: "Statut invalide." });
  if (update.home_team_id && update.away_team_id && update.home_team_id === update.away_team_id) return res.status(400).json({ error: "Les deux Ã©quipes doivent Ãªtre diffÃ©rentes." });
  const { data, error } = await db().from("matches").update(update).eq("id", req.params.id).select(matchSelect()).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/matches/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("matches").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}));

app.put("/api/matches/:id/result", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const home = integer(req.body.home_score, { min: 0, max: 99 });
  const away = integer(req.body.away_score, { min: 0, max: 99 });
  if (home === null || away === null) return res.status(400).json({ error: "Les scores doivent Ãªtre des entiers de 0 Ã  99." });
  const { data, error } = await db().from("matches").update({ home_score: home, away_score: away, status: "finished" }).eq("id", req.params.id).select(matchSelect()).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.get("/api/standings", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("standings").select("*").order("points", { ascending: false }).order("goal_difference", { ascending: false }).order("goals_for", { ascending: false }).order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.get("/api/statistics/top-scorers", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("player_statistics").select("*").order("goals", { ascending: false }).order("assists", { ascending: false }).order("player_name").limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.get("/api/goals", asyncRoute(async (req, res) => {
  let query = db().from("goals").select("id,match_id,player_id,team_id,minute,players(first_name,last_name),teams(name)").order("minute").order("created_at");
  if (isUuid(req.query.match_id)) query = query.eq("match_id", req.query.match_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/goals", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const match_id = req.body.match_id, team_id = req.body.team_id, player_id = req.body.player_id || null, minute = integer(req.body.minute, { min: 0, max: 130 });
  if (!isUuid(match_id) || !isUuid(team_id) || minute === null) return res.status(400).json({ error: "Match, Ã©quipe et minute valides obligatoires." });
  if (player_id && !isUuid(player_id)) return res.status(400).json({ error: "Joueur invalide." });
  const { data, error } = await db().from("goals").insert({ match_id, team_id, player_id, minute }).select("id,match_id,player_id,team_id,minute").single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.delete("/api/goals/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("goals").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}));

app.get("/api/cards", asyncRoute(async (req, res) => {
  let query = db().from("cards").select("id,match_id,player_id,team_id,card_type,minute,players(first_name,last_name),teams(name)").order("minute").order("created_at");
  if (isUuid(req.query.match_id)) query = query.eq("match_id", req.query.match_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/cards", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const match_id = req.body.match_id, team_id = req.body.team_id, player_id = req.body.player_id || null, minute = integer(req.body.minute, { min: 0, max: 130 });
  if (!isUuid(match_id) || !isUuid(team_id) || minute === null || !["yellow", "red"].includes(req.body.card_type)) return res.status(400).json({ error: "Match, Ã©quipe, type et minute valides obligatoires." });
  if (player_id && !isUuid(player_id)) return res.status(400).json({ error: "Joueur invalide." });
  const { data, error } = await db().from("cards").insert({ match_id, team_id, player_id, card_type: req.body.card_type, minute }).select("id,match_id,player_id,team_id,card_type,minute").single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.delete("/api/cards/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("cards").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}));

app.get("/api/referees", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("referees").select("*").order("last_name").order("first_name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/referees", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const first_name = cleanText(req.body.first_name, 80), last_name = cleanText(req.body.last_name, 80);
  if (!first_name || !last_name) return res.status(400).json({ error: "PrÃ©nom et nom obligatoires." });
  const { data, error } = await db().from("referees").insert({ first_name, last_name, license_number: cleanText(req.body.license_number, 80) }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/referees/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const update = {};
  for (const key of ["first_name", "last_name", "license_number"]) if (req.body[key] !== undefined) update[key] = cleanText(req.body[key], 80);
  const { data, error } = await db().from("referees").update(update).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/referees/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("referees").delete().eq("id", req.params.id);
  if (error) return res.status(409).json({ error: "Impossible de supprimer cet arbitre s'il est affectÃ© Ã  un match." });
  res.json({ success: true });
}));

app.get("/api/stadiums", asyncRoute(async (req, res) => {
  const { data, error } = await db().from("stadiums").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/stadiums", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name, 120);
  const capacity = req.body.capacity === "" || req.body.capacity == null ? null : integer(req.body.capacity, { min: 0, max: 200000 });
  if (!name || (req.body.capacity !== "" && req.body.capacity != null && capacity === null)) return res.status(400).json({ error: "Nom et capacitÃ© valides obligatoires." });
  const { data, error } = await db().from("stadiums").insert({ name, city: cleanText(req.body.city, 100), capacity, address: cleanText(req.body.address, 200) }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.put("/api/stadiums/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const update = {};
  for (const key of ["name", "city", "address"]) if (req.body[key] !== undefined) update[key] = cleanText(req.body[key], key === "address" ? 200 : 120);
  if (req.body.capacity !== undefined) update.capacity = req.body.capacity === "" ? null : integer(req.body.capacity, { min: 0, max: 200000 });
  const { data, error } = await db().from("stadiums").update(update).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.delete("/api/stadiums/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { error } = await db().from("stadiums").delete().eq("id", req.params.id);
  if (error) return res.status(409).json({ error: "Impossible de supprimer ce stade s'il est utilisÃ© par un match." });
  res.json({ success: true });
}));

app.get("/api/notifications", requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await db().from("notifications").select("id,user_id,title,message,type,read,created_at").or(`user_id.eq.${req.user.id},user_id.is.null`).order("created_at", { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

app.post("/api/notifications", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const title = cleanText(req.body.title, 120), message = cleanText(req.body.message, 500);
  if (!title || !message) return res.status(400).json({ error: "Titre et message obligatoires." });
  const user_id = req.body.user_id && isUuid(req.body.user_id) ? req.body.user_id : null;
  const { data, error } = await db().from("notifications").insert({ user_id, title, message, type: cleanText(req.body.type, 30) || "info" }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}));

app.patch("/api/notifications/:id/read", requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await db().from("notifications").update({ read: true }).eq("id", req.params.id).or(`user_id.eq.${req.user.id},user_id.is.null`).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}));

app.get("/*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Route API introuvable." });
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, req, res, next) => {
  console.error("FOOT26 error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: isProduction ? "Erreur serveur." : (err.message || "Erreur serveur.") });
});

if (process.env.VERCEL !== "1") app.listen(PORT, () => console.log(`FOOT26 sur http://localhost:${PORT}`));

module.exports = app;

