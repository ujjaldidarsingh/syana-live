const CONFIG = window.SYANA_LIVE_CONFIG || {};
const SUPABASE_CONFIGURED = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const app = document.querySelector("#app");

const PROMPT_TYPES = {
  word_cloud: "Word cloud",
  multiple_choice: "Multiple choice",
  rating: "Rating",
  open_text: "Response wall",
  reflection_map: "Reflection map",
  spectrum: "Spectrum",
  ranking: "Priority stack",
};

const SAMPLE_PROMPTS = [
  {
    type: "word_cloud",
    title: "What word or short phrase describes the Sangat you hope we build?",
    description: "",
    options: [],
    settings: {},
  },
  {
    type: "multiple_choice",
    title: "Which retreat format helps you engage most deeply?",
    description: "",
    options: ["Keertan", "Gurbani Vichaar", "Small-group discussion", "Reflection or journaling", "Seva"],
    settings: {},
  },
  {
    type: "rating",
    title: "How grounded do you feel after this session?",
    description: "",
    options: [],
    settings: { scaleMax: 5 },
  },
  {
    type: "open_text",
    title: "What is one question or tension you want us to carry into Vichaar?",
    description: "Responses can be approved before they appear on the display.",
    options: [],
    settings: { moderate: true, scaleMax: 5 },
  },
  {
    type: "multiple_choice",
    title: "Which topic should we spend more time with tomorrow?",
    description: "",
    options: ["Hukam", "Sangat", "Seva", "Daily practice", "Family and community"],
    settings: {},
  },
  {
    type: "reflection_map",
    title: "Where are you arriving right now?",
    description: "",
    options: [],
    settings: {
      xMinLabel: "Unclear",
      xMaxLabel: "Clear",
      yMinLabel: "Closed",
      yMaxLabel: "Open",
    },
  },
  {
    type: "spectrum",
    title: "What would support your learning today?",
    description: "",
    options: [],
    settings: {
      minLabel: "More structure",
      maxLabel: "More spaciousness",
    },
  },
  {
    type: "ranking",
    title: "What should our Sangat prioritize after retreat?",
    description: "Tap choices in the order you would prioritize them.",
    options: ["Daily simran", "Seva projects", "Youth mentorship", "Gurbani study", "Family conversations"],
    settings: {},
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "for", "from", "i", "in", "is", "it", "of", "on", "or", "our", "that", "the", "this", "to", "we", "with", "you", "your",
]);

const state = {
  route: parseRoute(),
  store: null,
  user: null,
  session: null,
  sessions: [],
  prompt: null,
  prompts: [],
  options: [],
  responses: [],
  sessionResponses: [],
  promptActivity: new Map(),
  feedback: [],
  participantValue: null,
  participantText: "",
  selectedSessionId: null,
  unsubscribe: null,
  status: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function participantId() {
  const key = "syana-live-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = uid();
    localStorage.setItem(key, id);
  }
  return id;
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const params = new URLSearchParams(location.search);
  if (hash.startsWith("admin/feedback")) return { name: "adminFeedback" };
  if (hash.startsWith("admin")) return { name: "admin" };
  if (hash.startsWith("feedback")) {
    const [, code] = hash.split("/");
    return { name: "feedback", code: normalizeCode(code || params.get("session") || CONFIG.defaultSessionCode) };
  }
  if (hash.startsWith("display")) {
    const [, code] = hash.split("/");
    return { name: "display", code: normalizeCode(code || params.get("session") || CONFIG.defaultSessionCode) };
  }
  return { name: "participant", code: normalizeCode(params.get("session") || params.get("s") || CONFIG.defaultSessionCode) };
}

function setRoute(route) {
  state.route = route;
  if (route.name === "admin") location.hash = "#/admin";
  if (route.name === "adminFeedback") location.hash = "#/admin/feedback";
  if (route.name === "feedback") location.hash = `#/feedback/${route.code || ""}`;
  if (route.name === "display") location.hash = `#/display/${route.code || ""}`;
}

function displayUrl(code) {
  const base = CONFIG.appBaseUrl || location.href.split("#")[0].split("?")[0];
  return `${base.replace(/\/?$/, "/")}#/display/${encodeURIComponent(code)}`;
}

function feedbackUrl(code) {
  const base = CONFIG.appBaseUrl || location.href.split("#")[0].split("?")[0];
  return `${base.replace(/\/?$/, "/")}#/feedback/${encodeURIComponent(code)}`;
}

function participantUrl(code) {
  const base = CONFIG.appBaseUrl || location.href.split("#")[0].split("?")[0];
  return `${base.replace(/\/?$/, "/")}?session=${encodeURIComponent(code)}`;
}

function displayParticipantUrl(code) {
  return participantUrl(code).replace(/^https?:\/\//, "");
}

function qrCodeUrl(value, size = 360) {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    margin: "18",
    data: value,
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

function optionTypes(type) {
  return type === "multiple_choice" || type === "ranking";
}

function effectivePromptType(prompt) {
  if (!prompt) return "";
  if (typeof prompt === "string") return prompt;
  if (prompt.settings?.visualType) return prompt.settings.visualType;
  if (prompt.settings?.promptType) return prompt.settings.promptType;
  if (
    prompt.type === "rating"
    && prompt.settings?.xMinLabel
    && prompt.settings?.xMaxLabel
    && prompt.settings?.yMinLabel
    && prompt.settings?.yMaxLabel
  ) {
    return "reflection_map";
  }
  return prompt.type;
}

function storagePromptType(type) {
  if (type === "reflection_map" || type === "spectrum") return "rating";
  if (type === "ranking") return "multiple_choice";
  return type;
}

function storagePromptSettings(input) {
  const settings = { ...(input.settings || {}) };
  settings.visualType = input.type;
  settings.promptType = input.type;
  return settings;
}

function axisSettings(settings = {}) {
  return {
    xMinLabel: settings.xMinLabel || "Less clear",
    xMaxLabel: settings.xMaxLabel || "More clear",
    yMinLabel: settings.yMinLabel || "Less open",
    yMaxLabel: settings.yMaxLabel || "More open",
  };
}

function spectrumSettings(settings = {}) {
  return {
    minLabel: settings.minLabel || "This",
    maxLabel: settings.maxLabel || "That",
  };
}

function uniqueRespondentCount(responses = state.responses) {
  return new Set(responses.map((response) => response.respondent_id)).size;
}

function isAnonymousUser(user) {
  return Boolean(user && (user.is_anonymous || user.app_metadata?.provider === "anonymous" || !user.email));
}

function adminErrorMessage(error) {
  const message = error?.message || String(error);
  if (/row-level security|permission denied|not authorized/i.test(message)) {
    return "This facilitator account is not in live_admins yet. Add the Supabase user ID to public.live_admins, then try again.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "That session code already exists. Try a different code, or select the existing session.";
  }
  return message;
}

function formatActivityTime(value) {
  if (!value) return "No responses yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No responses yet";
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function activityLabel(activity = {}) {
  return activity.lastAt ? `Last engaged ${formatActivityTime(activity.lastAt)}` : "No engagement yet";
}

function buildPromptActivity(prompts, responses) {
  const activity = new Map(prompts.map((prompt) => [prompt.id, { count: 0, lastAt: "" }]));
  responses.forEach((response) => {
    const entry = activity.get(response.prompt_id);
    if (!entry) return;
    entry.count += 1;
    const touchedAt = response.updated_at || response.created_at || "";
    if (touchedAt && (!entry.lastAt || new Date(touchedAt) > new Date(entry.lastAt))) entry.lastAt = touchedAt;
  });
  return activity;
}

function groupedPrompts() {
  return Object.entries(PROMPT_TYPES)
    .map(([type, label]) => ({
      type,
      label,
      prompts: state.prompts
        .map((prompt, index) => ({ prompt, number: index + 1 }))
        .filter((item) => effectivePromptType(item.prompt) === type),
    }))
    .filter((group) => group.prompts.length);
}

async function copyText(value, label = "Copied") {
  await navigator.clipboard.writeText(value);
  state.status = label;
}

async function createStore() {
  if (!SUPABASE_CONFIGURED) return new DemoStore();
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const supabase = module.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return new SupabaseStore(supabase);
}

class DemoStore {
  constructor() {
    this.key = "syana-live-demo-v1";
    this.listeners = new Set();
    if (!localStorage.getItem(this.key)) this.write(seedDemo());
    window.addEventListener("storage", (event) => {
      if (event.key === this.key) this.emit();
    });
  }

  read() {
    return JSON.parse(localStorage.getItem(this.key));
  }

  write(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
    this.emit();
  }

  emit() {
    this.listeners.forEach((fn) => fn());
  }

  async ensureParticipant() {
    return { id: participantId(), isDemo: true };
  }

  async currentUser() {
    return { id: "demo-admin", email: "demo@syana.local", isDemo: true };
  }

  async adminLogin() {
    return this.currentUser();
  }

  async adminLogout() {}

  async listSessions() {
    return this.read().sessions.filter((session) => !session.is_archived);
  }

  async createSession(input) {
    const data = this.read();
    const session = {
      id: uid(),
      code: normalizeCode(input.code),
      title: input.title || "Gurmat Retreat",
      is_archived: false,
      created_at: new Date().toISOString(),
    };
    data.sessions.push(session);
    this.write(data);
    return session;
  }

  async getSessionByCode(code) {
    return this.read().sessions.find((session) => session.code === normalizeCode(code) && !session.is_archived) || null;
  }

  async archiveSession(sessionId) {
    const data = this.read();
    data.sessions = data.sessions.map((session) => (
      session.id === sessionId ? { ...session, is_archived: true, archived_at: new Date().toISOString() } : session
    ));
    data.prompts = data.prompts.map((prompt) => (
      prompt.session_id === sessionId ? { ...prompt, is_active: false, status: "closed" } : prompt
    ));
    this.write(data);
  }

  async listPrompts(sessionId) {
    return this.read().prompts.filter((prompt) => prompt.session_id === sessionId);
  }

  async getActivePrompt(sessionId) {
    return this.read().prompts.find((prompt) => prompt.session_id === sessionId && prompt.is_active) || null;
  }

  async listOptions(promptId) {
    return this.read().options.filter((option) => option.prompt_id === promptId).sort((a, b) => a.sort_order - b.sort_order);
  }

  async listResponses(promptId) {
    return this.read().responses.filter((response) => response.prompt_id === promptId);
  }

  async listSessionResponses(sessionId) {
    return this.read().responses.filter((response) => response.session_id === sessionId);
  }

  async createPrompt(input) {
    const data = this.read();
    const prompt = {
      id: uid(),
      session_id: input.session_id,
      type: storagePromptType(input.type),
      title: input.title,
      description: input.description || "",
      status: "draft",
      is_active: false,
      settings: storagePromptSettings(input),
      created_at: new Date().toISOString(),
    };
    data.prompts.push(prompt);
    input.options.forEach((label, index) => {
      data.options.push({ id: uid(), prompt_id: prompt.id, label, sort_order: index + 1 });
    });
    this.write(data);
    return prompt;
  }

  async updatePrompt(promptId, input) {
    const data = this.read();
    data.prompts = data.prompts.map((prompt) => (
      prompt.id === promptId
        ? {
            ...prompt,
            type: storagePromptType(input.type),
            title: input.title,
            description: input.description || "",
            settings: storagePromptSettings(input),
          }
        : prompt
    ));
    data.options = data.options.filter((option) => option.prompt_id !== promptId);
    input.options.forEach((label, index) => {
      data.options.push({ id: uid(), prompt_id: promptId, label, sort_order: index + 1 });
    });
    this.write(data);
    return data.prompts.find((prompt) => prompt.id === promptId);
  }

  async deletePrompt(promptId) {
    const data = this.read();
    data.prompts = data.prompts.filter((prompt) => prompt.id !== promptId);
    data.options = data.options.filter((option) => option.prompt_id !== promptId);
    data.responses = data.responses.filter((response) => response.prompt_id !== promptId);
    this.write(data);
  }

  async setActivePrompt(sessionId, promptId) {
    const data = this.read();
    data.prompts = data.prompts.map((prompt) => (
      prompt.session_id === sessionId
        ? { ...prompt, is_active: prompt.id === promptId, status: prompt.id === promptId ? "open" : "closed" }
        : prompt
    ));
    this.write(data);
  }

  async closeSessionPrompts(sessionId) {
    const data = this.read();
    data.prompts = data.prompts.map((prompt) => (
      prompt.session_id === sessionId ? { ...prompt, is_active: false, status: "closed" } : prompt
    ));
    this.write(data);
  }

  async submitResponse(input) {
    const data = this.read();
    const existing = data.responses.findIndex((response) => response.prompt_id === input.prompt_id && response.respondent_id === input.respondent_id);
    const response = {
      id: existing >= 0 ? data.responses[existing].id : uid(),
      ...input,
      is_approved: input.is_approved ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existing >= 0) data.responses[existing] = response;
    else data.responses.push(response);
    this.write(data);
    return response;
  }

  async setResponseApproval(responseId, isApproved) {
    const data = this.read();
    data.responses = data.responses.map((response) => (
      response.id === responseId ? { ...response, is_approved: isApproved } : response
    ));
    this.write(data);
  }

  async submitFeedback(input) {
    const data = this.read();
    data.feedback = data.feedback || [];
    const existing = data.feedback.findIndex((entry) => entry.session_id === input.session_id && entry.respondent_id === input.respondent_id);
    const feedback = {
      id: existing >= 0 ? data.feedback[existing].id : uid(),
      ...input,
      created_at: existing >= 0 ? data.feedback[existing].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existing >= 0) data.feedback[existing] = feedback;
    else data.feedback.push(feedback);
    this.write(data);
    return feedback;
  }

  async listFeedback(sessionId) {
    return (this.read().feedback || []).filter((entry) => entry.session_id === sessionId);
  }

  subscribe(sessionId, callback) {
    const fn = () => callback();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

class SupabaseStore {
  constructor(client) {
    this.client = client;
  }

  async ensureParticipant() {
    const session = await this.client.auth.getSession();
    if (session.data.session?.user) return session.data.session.user;
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async currentUser() {
    const { data } = await this.client.auth.getUser();
    return data.user || null;
  }

  async adminLogin(email, password) {
    const current = await this.currentUser();
    if (isAnonymousUser(current)) await this.client.auth.signOut();
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async adminLogout() {
    await this.client.auth.signOut();
  }

  async listSessions() {
    const { data, error } = await this.client.from("live_sessions").select("*").eq("is_archived", false).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async createSession(input) {
    const { data, error } = await this.client.from("live_sessions").insert({
      code: normalizeCode(input.code),
      title: input.title,
    }).select("*").single();
    if (error) throw error;
    return data;
  }

  async getSessionByCode(code) {
    const { data, error } = await this.client.from("live_sessions").select("*").eq("code", normalizeCode(code)).eq("is_archived", false).maybeSingle();
    if (error) throw error;
    return data;
  }

  async archiveSession(sessionId) {
    const { error } = await this.client.from("live_sessions").update({ is_archived: true }).eq("id", sessionId);
    if (error) throw error;
    await this.closeSessionPrompts(sessionId);
  }

  async listPrompts(sessionId) {
    const { data, error } = await this.client.from("live_prompts").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async getActivePrompt(sessionId) {
    const { data, error } = await this.client.from("live_prompts").select("*").eq("session_id", sessionId).eq("is_active", true).maybeSingle();
    if (error) throw error;
    return data;
  }

  async listOptions(promptId) {
    const { data, error } = await this.client.from("live_prompt_options").select("*").eq("prompt_id", promptId).order("sort_order", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async listResponses(promptId) {
    const { data, error } = await this.client.from("live_responses").select("*").eq("prompt_id", promptId).order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async listSessionResponses(sessionId) {
    const { data, error } = await this.client.from("live_responses").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createPrompt(input) {
    const { data: prompt, error } = await this.client.from("live_prompts").insert({
      session_id: input.session_id,
      type: storagePromptType(input.type),
      title: input.title,
      description: input.description,
      settings: storagePromptSettings(input),
    }).select("*").single();
    if (error) throw error;
    if (input.options.length) {
      const rows = input.options.map((label, index) => ({ prompt_id: prompt.id, label, sort_order: index + 1 }));
      const { error: optionError } = await this.client.from("live_prompt_options").insert(rows);
      if (optionError) throw optionError;
    }
    return prompt;
  }

  async updatePrompt(promptId, input) {
    const { data: prompt, error } = await this.client.from("live_prompts").update({
      type: storagePromptType(input.type),
      title: input.title,
      description: input.description,
      settings: storagePromptSettings(input),
    }).eq("id", promptId).select("*").single();
    if (error) throw error;

    const { error: deleteError } = await this.client.from("live_prompt_options").delete().eq("prompt_id", promptId);
    if (deleteError) throw deleteError;

    if (input.options.length) {
      const rows = input.options.map((label, index) => ({ prompt_id: prompt.id, label, sort_order: index + 1 }));
      const { error: optionError } = await this.client.from("live_prompt_options").insert(rows);
      if (optionError) throw optionError;
    }
    return prompt;
  }

  async deletePrompt(promptId) {
    const { error } = await this.client.from("live_prompts").delete().eq("id", promptId);
    if (error) throw error;
  }

  async setActivePrompt(sessionId, promptId) {
    const { error } = await this.client.rpc("set_active_live_prompt", { target_session_id: sessionId, target_prompt_id: promptId });
    if (error) throw error;
  }

  async closeSessionPrompts(sessionId) {
    const { error } = await this.client.from("live_prompts").update({ is_active: false, status: "closed" }).eq("session_id", sessionId);
    if (error) throw error;
  }

  async submitResponse(input) {
    const { data, error } = await this.client.from("live_responses").upsert(input, { onConflict: "prompt_id,respondent_id" }).select("*").single();
    if (error) throw error;
    return data;
  }

  async setResponseApproval(responseId, isApproved) {
    const { error } = await this.client.from("live_responses").update({ is_approved: isApproved }).eq("id", responseId);
    if (error) throw error;
  }

  async submitFeedback(input) {
    const { data, error } = await this.client.from("live_feedback").upsert(input, { onConflict: "session_id,respondent_id" }).select("*").single();
    if (error) throw error;
    return data;
  }

  async listFeedback(sessionId) {
    const { data, error } = await this.client.from("live_feedback").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  subscribe(sessionId, callback) {
    const channel = this.client
      .channel(`syana-live-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_prompts", filter: `session_id=eq.${sessionId}` }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_responses", filter: `session_id=eq.${sessionId}` }, callback)
      .subscribe();
    return () => this.client.removeChannel(channel);
  }
}

function seedDemo() {
  const sessionId = uid();
  const prompts = SAMPLE_PROMPTS.map((prompt, index) => ({
    id: uid(),
    session_id: sessionId,
    type: prompt.type,
    title: prompt.title,
    description: prompt.description,
    status: index === 0 ? "open" : "draft",
    is_active: index === 0,
    settings: prompt.settings,
    created_at: new Date().toISOString(),
  }));
  const options = SAMPLE_PROMPTS.flatMap((prompt, promptIndex) => (
    prompt.options.map((label, optionIndex) => ({
      id: uid(),
      prompt_id: prompts[promptIndex].id,
      label,
      sort_order: optionIndex + 1,
    }))
  ));
  return {
    sessions: [{ id: sessionId, code: "DEMO", title: "SYANA Gurmat Retreat", is_archived: false, created_at: new Date().toISOString() }],
    prompts,
    options,
    responses: [
      "warmth", "belonging", "seva", "honesty", "charhdi kala", "belonging", "simran", "sangat", "home", "discipline", "sangat", "care",
    ].map((word) => ({
      id: uid(), session_id: sessionId, prompt_id: prompts[0].id, respondent_id: uid(), value_text: word, value_json: {}, is_approved: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })),
    feedback: [],
  };
}

async function init() {
  state.store = await createStore();
  window.addEventListener("hashchange", async () => {
    state.route = parseRoute();
    await loadRoute();
  });
  await loadRoute();
}

async function loadRoute() {
  cleanupSubscription();
  state.status = "";
  state.session = null;
  state.prompt = null;
  state.prompts = [];
  state.options = [];
  state.responses = [];
  state.sessionResponses = [];
  state.promptActivity = new Map();
  state.feedback = [];
  state.lastRenderedPromptId = "";
  state.participantValue = null;
  state.participantText = "";

  try {
    if (state.route.name === "admin") await loadAdmin();
    else if (state.route.name === "adminFeedback") await loadAdminFeedback();
    else if (state.route.name === "feedback") await loadFeedback(state.route.code);
    else if (state.route.name === "display") await loadDisplay(state.route.code);
    else await loadParticipant(state.route.code);
  } catch (error) {
    renderError(error.message || String(error));
  }
}

function cleanupSubscription() {
  if (typeof state.unsubscribe === "function") state.unsubscribe();
  state.unsubscribe = null;
}

async function loadParticipant(code) {
  state.user = await state.store.ensureParticipant();
  if (!code) {
    renderJoin();
    return;
  }
  state.session = await state.store.getSessionByCode(code);
  if (!state.session) {
    renderJoin(`No live session found for ${escapeHtml(code)}.`);
    return;
  }
  await refreshActive();
  state.unsubscribe = state.store.subscribe(state.session.id, refreshActiveAndRender);
  renderParticipant();
}

async function refreshActiveAndRender() {
  const previousPromptId = state.prompt?.id || "";
  await refreshActive();
  if (state.route.name === "display") renderDisplay();
  else if (state.route.name === "participant") {
    const nextPromptId = state.prompt?.id || "";
    if (previousPromptId !== nextPromptId || state.lastRenderedPromptId !== nextPromptId) renderParticipant();
    else updateParticipantLiveMeta();
  }
}

async function refreshActive() {
  state.prompt = await state.store.getActivePrompt(state.session.id);
  if (!state.prompt) {
    state.options = [];
    state.responses = [];
    return;
  }
  state.options = await state.store.listOptions(state.prompt.id);
  state.responses = await state.store.listResponses(state.prompt.id);
}

function renderJoin(error = "") {
  app.innerHTML = `
    <main class="join-view">
      <section class="join-hero">
        <img src="./assets/syana-logo.png" alt="SYANA" />
        <div>
          <p class="eyebrow">Gurmat Retreat Live</p>
          <h1>Join the room.</h1>
          <p>Answer prompts from your phone while the facilitator shares live results with the Sangat.</p>
        </div>
      </section>
      <section class="join-panel">
        <h2 class="panel-title">Session code</h2>
        <p class="panel-copy">Enter the code shown on the projector.</p>
        <form class="form-stack" data-action="join">
          <label class="field">
            <span>Code</span>
            <input class="code-input" name="code" autocomplete="off" inputmode="latin" value="${escapeHtml(state.route.code || "")}" />
          </label>
          <button class="button" type="submit">Join session</button>
          <div class="status-line ${error ? "error" : ""}">${error || (SUPABASE_CONFIGURED ? "" : "Demo mode: use DEMO.")}</div>
        </form>
      </section>
    </main>
  `;
  app.querySelector("[data-action='join']").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = normalizeCode(new FormData(event.currentTarget).get("code"));
    location.href = `?session=${encodeURIComponent(code)}`;
  });
}

function shell(content, actions = "") {
  return `
    <header class="topbar">
      <div class="brand-lockup">
        <img src="./assets/syana-logo.png" alt="SYANA" />
        <div class="brand-meta">
          <span class="eyebrow">Gurmat Retreat Live</span>
          <h1 class="brand-title">${escapeHtml(state.session?.title || "SYANA Live")}</h1>
        </div>
      </div>
      <nav class="nav-actions">${actions}</nav>
    </header>
    ${content}
  `;
}

async function loadFeedback(code) {
  state.user = await state.store.ensureParticipant();
  if (!code) {
    renderFeedbackJoin();
    return;
  }
  state.session = await state.store.getSessionByCode(code);
  if (!state.session) {
    renderFeedbackJoin(`No live session found for ${escapeHtml(code)}.`);
    return;
  }
  renderFeedbackForm();
}

function renderFeedbackJoin(error = "") {
  app.innerHTML = `
    <main class="join-view">
      <section class="join-hero">
        <img src="./assets/syana-logo.png" alt="SYANA" />
        <div>
          <p class="eyebrow">Retreat Feedback</p>
          <h1>Share what stayed with you.</h1>
          <p>Your feedback helps shape the next SYANA Gurmat Retreat.</p>
        </div>
      </section>
      <section class="join-panel">
        <h2 class="panel-title">Session code</h2>
        <form class="form-stack" data-action="feedback-join">
          <label class="field">
            <span>Code</span>
            <input class="code-input" name="code" autocomplete="off" inputmode="latin" value="${escapeHtml(state.route.code || "")}" />
          </label>
          <button class="button" type="submit">Open feedback</button>
          <div class="status-line ${error ? "error" : ""}">${error}</div>
        </form>
      </section>
    </main>
  `;
  app.querySelector("[data-action='feedback-join']").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = normalizeCode(new FormData(event.currentTarget).get("code"));
    location.hash = `#/feedback/${encodeURIComponent(code)}`;
  });
}

function ratingSelectHtml(name, label) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        <option value="">Choose</option>
        <option value="5">5 - Strongly agree</option>
        <option value="4">4 - Agree</option>
        <option value="3">3 - Neutral</option>
        <option value="2">2 - Disagree</option>
        <option value="1">1 - Strongly disagree</option>
      </select>
    </label>
  `;
}

function renderFeedbackForm() {
  const actions = `<a class="ghost-button" href="${escapeHtml(participantUrl(state.session.code))}">Live prompts</a>`;
  app.innerHTML = shell(`
    <main class="content-wrap feedback-view">
      <section class="feedback-panel">
        <div class="section-head">
          <div>
            <span class="eyebrow">Session ${escapeHtml(state.session.code)}</span>
            <h2>Retreat feedback</h2>
          </div>
        </div>
        <form class="form-grid" data-action="submit-feedback">
          <label class="field">
            <span>Name, optional</span>
            <input name="name" autocomplete="name" />
          </label>
          <label class="field">
            <span>Contact, optional</span>
            <input name="contact" autocomplete="email" />
          </label>
          ${ratingSelectHtml("overall_rating", "Overall retreat experience")}
          ${ratingSelectHtml("sangat_rating", "I felt welcomed in Sangat")}
          ${ratingSelectHtml("gurmat_rating", "The retreat helped deepen my Gurmat connection")}
          ${ratingSelectHtml("workshop_rating", "Workshops were useful and engaging")}
          <label class="field">
            <span>Would you recommend retreat?</span>
            <select name="recommend">
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          </label>
          <label class="field">
            <span>Would you come again?</span>
            <select name="returning">
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          </label>
          <label class="field full">
            <span>What was most meaningful?</span>
            <textarea name="favorite_text"></textarea>
          </label>
          <label class="field full">
            <span>What should we improve?</span>
            <textarea name="improve_text"></textarea>
          </label>
          <label class="field full">
            <span>Any workshop, seva, logistics, or facilitator feedback?</span>
            <textarea name="workshop_text"></textarea>
          </label>
          <label class="field full">
            <span>Anything else you want the admin team to know?</span>
            <textarea name="additional_text"></textarea>
          </label>
          <div class="field full">
            <button class="button" type="submit">Submit feedback</button>
            <div class="status-line">${escapeHtml(state.status)}</div>
          </div>
        </form>
      </section>
    </main>
  `, actions);
  app.querySelector("[data-action='submit-feedback']").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      session_id: state.session.id,
      respondent_id: state.user.id,
      name: String(data.get("name") || "").trim(),
      contact: String(data.get("contact") || "").trim(),
      overall_rating: Number(data.get("overall_rating") || 0) || null,
      sangat_rating: Number(data.get("sangat_rating") || 0) || null,
      gurmat_rating: Number(data.get("gurmat_rating") || 0) || null,
      workshop_rating: Number(data.get("workshop_rating") || 0) || null,
      recommend: String(data.get("recommend") || ""),
      returning: String(data.get("returning") || ""),
      favorite_text: String(data.get("favorite_text") || "").trim(),
      improve_text: String(data.get("improve_text") || "").trim(),
      workshop_text: String(data.get("workshop_text") || "").trim(),
      additional_text: String(data.get("additional_text") || "").trim(),
    };
    try {
      await state.store.submitFeedback(payload);
      state.status = "Feedback submitted. Thank you.";
      renderFeedbackForm();
    } catch (error) {
      state.status = error.message || String(error);
      renderFeedbackForm();
    }
  });
}

function renderParticipant() {
  const actions = `<a class="ghost-button" href="${escapeHtml(feedbackUrl(state.session.code))}">Feedback</a><a class="ghost-button" href="./">Switch session</a>`;
  if (!state.prompt) {
    state.lastRenderedPromptId = "";
    app.innerHTML = shell(`
      <main class="waiting">
        <div>
          <p class="eyebrow">Session ${escapeHtml(state.session.code)}</p>
          <h1>Waiting for the next prompt.</h1>
          <p>Keep this page open.</p>
        </div>
      </main>
    `, actions);
    return;
  }

  const type = effectivePromptType(state.prompt);
  state.lastRenderedPromptId = state.prompt.id;
  app.innerHTML = shell(`
    <main class="content-wrap participant-view">
      <section class="prompt-stage">
        <article class="prompt-card">
          <span class="eyebrow">${escapeHtml(PROMPT_TYPES[type] || type)}</span>
          <h1>${escapeHtml(state.prompt.title)}</h1>
          ${state.prompt.description ? `<p>${escapeHtml(state.prompt.description)}</p>` : ""}
          <form class="form-stack" data-action="respond">
            ${participantInputHtml()}
            <button class="button" type="submit">Submit answer</button>
            <div class="status-line">${escapeHtml(state.status)}</div>
          </form>
        </article>
        <aside class="side-panel">
          <span class="eyebrow">Live room</span>
          <h2 class="brand-title">${escapeHtml(state.session.code)}</h2>
          <p class="panel-copy" data-live-response-count>${state.responses.length} response${state.responses.length === 1 ? "" : "s"} received.</p>
          <div class="submitted-box ${state.status ? "" : "hidden"}">Your latest answer is saved.</div>
        </aside>
      </section>
    </main>
  `, actions);

  attachParticipantEvents();
}

function updateParticipantLiveMeta() {
  const counter = app.querySelector("[data-live-response-count]");
  if (counter) {
    counter.textContent = `${state.responses.length} response${state.responses.length === 1 ? "" : "s"} received.`;
  }
}

function participantInputHtml() {
  const type = effectivePromptType(state.prompt);
  if (type === "multiple_choice") {
    return `
      <div class="option-grid" data-input="choice">
        ${state.options.map((option) => `<button class="option-button" type="button" data-option-id="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`).join("")}
      </div>
    `;
  }
  if (type === "rating") {
    const max = Number(state.prompt.settings?.scaleMax || 5);
    return `
      <div class="rating-grid" data-input="rating">
        ${Array.from({ length: max }, (_, index) => `<button class="rating-button" type="button" data-rating="${index + 1}">${index + 1}</button>`).join("")}
      </div>
    `;
  }
  if (type === "reflection_map") {
    const labels = axisSettings(state.prompt.settings);
    return `
      <div class="map-input" data-input="reflection-map">
        <label class="field">
          <span>${escapeHtml(labels.xMinLabel)} ↔ ${escapeHtml(labels.xMaxLabel)}</span>
          <input name="mapX" type="range" min="0" max="100" value="50" />
        </label>
        <label class="field">
          <span>${escapeHtml(labels.yMinLabel)} ↔ ${escapeHtml(labels.yMaxLabel)}</span>
          <input name="mapY" type="range" min="0" max="100" value="50" />
        </label>
      </div>
    `;
  }
  if (type === "spectrum") {
    const labels = spectrumSettings(state.prompt.settings);
    return `
      <div class="spectrum-input" data-input="spectrum">
        <div class="spectrum-labels"><span>${escapeHtml(labels.minLabel)}</span><span>${escapeHtml(labels.maxLabel)}</span></div>
        <input name="spectrumValue" type="range" min="0" max="100" value="50" />
      </div>
    `;
  }
  if (type === "ranking") {
    return `
      <div class="ranking-input" data-input="ranking">
        ${state.options.map((option) => `
          <button class="ranking-button" type="button" data-option-id="${escapeHtml(option.id)}">
            <span class="rank-number"></span>
            <span>${escapeHtml(option.label)}</span>
          </button>
        `).join("")}
      </div>
    `;
  }
  const label = type === "word_cloud" ? "Your word or short phrase" : "Your response";
  const maxLength = type === "word_cloud" ? 80 : 360;
  return `
    <label class="field">
      <span>${label}</span>
      <textarea name="response" maxlength="${maxLength}" placeholder=""></textarea>
    </label>
  `;
}

function attachParticipantEvents() {
  app.querySelectorAll(".option-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.participantValue = button.dataset.optionId;
      app.querySelectorAll(".option-button").forEach((item) => item.classList.toggle("selected", item === button));
    });
  });
  app.querySelectorAll(".rating-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.participantValue = Number(button.dataset.rating);
      app.querySelectorAll(".rating-button").forEach((item) => item.classList.toggle("selected", item === button));
    });
  });
  app.querySelectorAll(".ranking-button").forEach((button) => {
    button.addEventListener("click", () => {
      const current = Array.isArray(state.participantValue) ? [...state.participantValue] : [];
      const optionId = button.dataset.optionId;
      const existing = current.indexOf(optionId);
      if (existing >= 0) current.splice(existing, 1);
      else current.push(optionId);
      state.participantValue = current;
      app.querySelectorAll(".ranking-button").forEach((item) => {
        const rank = current.indexOf(item.dataset.optionId);
        item.classList.toggle("selected", rank >= 0);
        item.querySelector(".rank-number").textContent = rank >= 0 ? rank + 1 : "";
      });
    });
  });
  app.querySelector("[data-action='respond']").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("response") || "").trim();
    const type = effectivePromptType(state.prompt);
    const payload = {
      session_id: state.session.id,
      prompt_id: state.prompt.id,
      respondent_id: state.user.id,
      value_text: "",
      value_json: {},
      is_approved: type !== "open_text" || !state.prompt.settings?.moderate,
    };
    if (type === "multiple_choice") {
      if (!state.participantValue) return setParticipantStatus("Choose an answer first.");
      payload.value_json = { option_id: state.participantValue };
    } else if (type === "rating") {
      if (!state.participantValue) return setParticipantStatus("Choose a rating first.");
      payload.value_json = { rating: state.participantValue };
    } else if (type === "reflection_map") {
      payload.value_json = {
        x: Number(form.get("mapX") || 50),
        y: Number(form.get("mapY") || 50),
      };
    } else if (type === "spectrum") {
      payload.value_json = { value: Number(form.get("spectrumValue") || 50) };
    } else if (type === "ranking") {
      if (!Array.isArray(state.participantValue) || state.participantValue.length < state.options.length) {
        return setParticipantStatus("Rank every option before submitting.");
      }
      payload.value_json = { ranking: state.participantValue };
    } else {
      if (!text) return setParticipantStatus("Add a response first.");
      payload.value_text = text;
    }
    try {
      state.participantText = text;
      await state.store.submitResponse(payload);
      state.status = "Answer received.";
      await refreshActive();
      renderParticipant();
    } catch (error) {
      setParticipantStatus(error.message || String(error), true);
    }
  });
}

function setParticipantStatus(message, isError = false) {
  const line = app.querySelector(".status-line");
  if (line) {
    line.textContent = message;
    line.classList.toggle("error", isError);
  }
}

async function loadDisplay(code) {
  if (!code) {
    renderDisplayJoin();
    return;
  }
  if (SUPABASE_CONFIGURED) await state.store.ensureParticipant();
  state.session = await state.store.getSessionByCode(code);
  if (!state.session) return renderDisplayJoin(`No session found for ${escapeHtml(code)}.`);
  await refreshActive();
  state.unsubscribe = state.store.subscribe(state.session.id, refreshActiveAndRender);
  renderDisplay();
}

function renderDisplayJoin(error = "") {
  app.innerHTML = `
    <main class="join-panel display-view">
      <h1 class="panel-title">Display session</h1>
      <form class="form-stack" data-action="display-join">
        <label class="field">
          <span>Code</span>
          <input class="code-input" name="code" autocomplete="off" />
        </label>
        <button class="button" type="submit">Open display</button>
        <div class="status-line error">${error}</div>
      </form>
    </main>
  `;
  app.querySelector("[data-action='display-join']").addEventListener("submit", (event) => {
    event.preventDefault();
    location.hash = `#/display/${normalizeCode(new FormData(event.currentTarget).get("code"))}`;
  });
}

function renderDisplay() {
  if (!state.prompt) {
    const joinUrl = participantUrl(state.session.code);
    app.innerHTML = `
      <main class="display-view">
        <section class="display-frame">
          <div class="display-head"><img src="./assets/syana-logo.png" alt="SYANA" /><span class="eyebrow">Session ${escapeHtml(state.session.code)}</span></div>
          <div class="display-results">
            <div class="launch-board">
              <p class="eyebrow">Join the room</p>
              <div class="join-grid">
                <div>
                  <h1>${escapeHtml(displayParticipantUrl(state.session.code))}</h1>
                  <div class="session-code">${escapeHtml(state.session.code)}</div>
                </div>
                <img class="qr-code" src="${escapeHtml(qrCodeUrl(joinUrl))}" alt="QR code for ${escapeHtml(displayParticipantUrl(state.session.code))}" />
              </div>
              <p>Keep this page open. The next question will appear automatically.</p>
            </div>
          </div>
          <div class="tiny">SYANA Gurmat Retreat Live</div>
        </section>
      </main>
    `;
    return;
  }

  app.innerHTML = `
    <main class="display-view">
      <section class="display-frame">
        <div class="display-head">
          <img src="./assets/syana-logo.png" alt="SYANA" />
          <span class="eyebrow">${escapeHtml(PROMPT_TYPES[effectivePromptType(state.prompt)] || effectivePromptType(state.prompt))} · ${uniqueRespondentCount()} participants · ${state.responses.length} responses</span>
        </div>
        <div>
          <h1 class="display-question">${escapeHtml(state.prompt.title)}</h1>
        </div>
        <section class="display-results">${resultsHtml(true)}</section>
      </section>
    </main>
  `;
}

async function loadAdmin() {
  state.user = await state.store.currentUser();
  if (SUPABASE_CONFIGURED && isAnonymousUser(state.user)) {
    await state.store.adminLogout();
    state.user = null;
  }
  if (SUPABASE_CONFIGURED && !state.user) {
    renderAdminLogin();
    return;
  }
  try {
    await refreshAdmin();
    renderAdmin();
  } catch (error) {
    state.status = adminErrorMessage(error);
    renderAdmin();
  }
}

async function loadAdminFeedback() {
  state.user = await state.store.currentUser();
  if (SUPABASE_CONFIGURED && isAnonymousUser(state.user)) {
    await state.store.adminLogout();
    state.user = null;
  }
  if (SUPABASE_CONFIGURED && !state.user) {
    renderAdminLogin();
    return;
  }
  try {
    state.sessions = await state.store.listSessions();
    state.selectedSessionId = state.selectedSessionId || state.sessions[0]?.id || null;
    state.session = state.sessions.find((session) => session.id === state.selectedSessionId) || state.sessions[0] || null;
    state.feedback = state.session ? await state.store.listFeedback(state.session.id) : [];
    renderAdminFeedback();
  } catch (error) {
    state.status = adminErrorMessage(error);
    renderAdminFeedback();
  }
}

async function refreshAdmin() {
  const previousPromptId = state.prompt?.id;
  state.sessions = await state.store.listSessions();
  state.selectedSessionId = state.selectedSessionId || state.sessions[0]?.id || null;
  state.session = state.sessions.find((session) => session.id === state.selectedSessionId) || state.sessions[0] || null;
  if (!state.session) {
    state.prompts = [];
    state.prompt = null;
    state.options = [];
    state.responses = [];
    state.sessionResponses = [];
    state.promptActivity = new Map();
    return;
  }
  state.selectedSessionId = state.session.id;
  state.prompts = await state.store.listPrompts(state.session.id);
  state.prompt = state.prompts.find((prompt) => prompt.id === previousPromptId) || state.prompts.find((prompt) => prompt.is_active) || state.prompts[0] || null;
  state.options = state.prompt ? await state.store.listOptions(state.prompt.id) : [];
  state.sessionResponses = await state.store.listSessionResponses(state.session.id);
  state.promptActivity = buildPromptActivity(state.prompts, state.sessionResponses);
  state.responses = state.prompt ? state.sessionResponses.filter((response) => response.prompt_id === state.prompt.id) : [];
}

function renderAdminLogin(error = "") {
  app.innerHTML = `
    <main class="join-view">
      <section class="join-hero">
        <img src="./assets/syana-logo.png" alt="SYANA" />
        <div>
          <p class="eyebrow">Facilitator</p>
          <h1>Open the room.</h1>
          <p>Manage prompts and display live results for retreat participants.</p>
        </div>
      </section>
      <section class="join-panel">
        <h2 class="panel-title">Facilitator login</h2>
        <form class="form-stack" data-action="admin-login">
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" /></label>
          <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" /></label>
          <button class="button" type="submit">Sign in</button>
          <div class="status-line error">${escapeHtml(error)}</div>
        </form>
      </section>
    </main>
  `;
  app.querySelector("[data-action='admin-login']").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      state.user = await state.store.adminLogin(data.get("email"), data.get("password"));
      if (state.route.name === "adminFeedback") await loadAdminFeedback();
      else await loadAdmin();
    } catch (loginError) {
      renderAdminLogin(loginError.message || String(loginError));
    }
  });
}

function renderAdmin() {
  app.innerHTML = shell(`
    <main class="admin-view">
      <section class="admin-layout">
        <aside class="admin-sidebar">
          <div class="section-head">
            <h2>Sessions</h2>
            <span class="pill">${SUPABASE_CONFIGURED ? "Live" : "Demo"}</span>
          </div>
          <div class="session-list">
            ${state.sessions.map((session) => `
              <button class="list-button ${session.id === state.session?.id ? "active" : ""}" data-session-id="${escapeHtml(session.id)}">
                <strong>${escapeHtml(session.title)}</strong>
                <small>${escapeHtml(session.code)}</small>
              </button>
            `).join("") || `<div class="empty-state">No sessions yet.</div>`}
          </div>
          <form class="form-stack admin-section" data-action="create-session">
            <label class="field"><span>Code</span><input class="code-input" name="code" value="RETREAT" /></label>
            <label class="field"><span>Title</span><input name="title" value="SYANA Gurmat Retreat" /></label>
            <button class="button" type="submit">Create session</button>
          </form>
        </aside>
        <section class="admin-main">
          ${state.session ? adminSessionHtml() : `<section class="admin-section"><div class="status-line error">${escapeHtml(state.status)}</div><div class="empty-state">Create a session to begin.</div></section>`}
        </section>
      </section>
    </main>
  `, `<a class="ghost-button" href="#/admin/feedback">Feedback</a><a class="ghost-button" href="./">Participant</a>${state.session ? `<a class="ghost-button" href="${escapeHtml(displayUrl(state.session.code))}">Display</a>` : ""}`);
  attachAdminEvents();
}

function renderAdminFeedback() {
  app.innerHTML = shell(`
    <main class="admin-view">
      <section class="admin-layout">
        <aside class="admin-sidebar">
          <div class="section-head">
            <h2>Feedback</h2>
            <span class="pill">${state.feedback.length}</span>
          </div>
          <div class="session-list">
            ${state.sessions.map((session) => `
              <button class="list-button ${session.id === state.session?.id ? "active" : ""}" data-feedback-session-id="${escapeHtml(session.id)}">
                <strong>${escapeHtml(session.title)}</strong>
                <small>${escapeHtml(session.code)}</small>
              </button>
            `).join("") || `<div class="empty-state">No sessions yet.</div>`}
          </div>
        </aside>
        <section class="admin-main">
          <section class="admin-section">
            <div class="section-head">
              <div>
                <span class="eyebrow">${escapeHtml(state.session?.code || "No session")}</span>
                <h2>Retreat feedback</h2>
              </div>
              <div class="toolbar">
                <a class="ghost-button" href="#/admin">Prompts</a>
                <button class="ghost-button" data-action="export-feedback" type="button">Export CSV</button>
              </div>
            </div>
            <div class="status-line">${escapeHtml(state.status)}</div>
            <div class="feedback-grid">
              ${state.feedback.map((entry) => feedbackCardHtml(entry)).join("") || `<div class="empty-state">No feedback yet.</div>`}
            </div>
          </section>
        </section>
      </section>
    </main>
  `, `<a class="ghost-button" href="#/admin">Prompts</a>${state.session ? `<a class="ghost-button" href="${escapeHtml(feedbackUrl(state.session.code))}">Feedback form</a>` : ""}`);
  app.querySelectorAll("[data-feedback-session-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedSessionId = button.dataset.feedbackSessionId;
      await loadAdminFeedback();
    });
  });
  app.querySelector("[data-action='export-feedback']")?.addEventListener("click", () => exportFeedbackCsv());
}

function feedbackCardHtml(entry) {
  return `
    <article class="feedback-card">
      <div class="feedback-card-head">
        <strong>${escapeHtml(entry.name || "Anonymous")}</strong>
        <small>${escapeHtml(formatActivityTime(entry.updated_at || entry.created_at))}</small>
      </div>
      <div class="feedback-ratings">
        <span>Overall ${escapeHtml(entry.overall_rating || "-")}</span>
        <span>Sangat ${escapeHtml(entry.sangat_rating || "-")}</span>
        <span>Gurmat ${escapeHtml(entry.gurmat_rating || "-")}</span>
        <span>Workshops ${escapeHtml(entry.workshop_rating || "-")}</span>
      </div>
      ${entry.favorite_text ? `<p><b>Meaningful:</b> ${escapeHtml(entry.favorite_text)}</p>` : ""}
      ${entry.improve_text ? `<p><b>Improve:</b> ${escapeHtml(entry.improve_text)}</p>` : ""}
      ${entry.workshop_text ? `<p><b>Workshop/logistics:</b> ${escapeHtml(entry.workshop_text)}</p>` : ""}
      ${entry.additional_text ? `<p><b>Other:</b> ${escapeHtml(entry.additional_text)}</p>` : ""}
      ${entry.contact ? `<p><b>Contact:</b> ${escapeHtml(entry.contact)}</p>` : ""}
    </article>
  `;
}

function adminSessionHtml() {
  return `
    <section class="admin-section">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHtml(state.session.code)}</span>
          <h2>${escapeHtml(state.session.title)}</h2>
        </div>
        <div class="toolbar">
          <button class="ghost-button" data-action="copy-participant" type="button">Copy participant link</button>
          <button class="ghost-button" data-action="copy-display" type="button">Copy display link</button>
          <button class="ghost-button" data-action="export-csv" type="button">Export CSV</button>
          <button class="danger-button" data-action="close-prompts" type="button">Close prompt</button>
          <button class="danger-button" data-action="close-session" type="button">Close session</button>
        </div>
      </div>
      <div class="launch-card">
        <div>
          <span class="eyebrow">Participant link</span>
          <strong>${escapeHtml(displayParticipantUrl(state.session.code))}</strong>
        </div>
        <div>
          <span class="eyebrow">Session code</span>
          <strong>${escapeHtml(state.session.code)}</strong>
        </div>
        <div>
          <span class="eyebrow">Display</span>
          <strong>${escapeHtml(displayUrl(state.session.code).replace(/^https?:\/\//, ""))}</strong>
        </div>
      </div>
      <div class="status-line">${escapeHtml(state.status)}</div>
      ${promptGroupsHtml()}
    </section>

    <section class="admin-section">
      <h2>Create prompt</h2>
      <form class="form-grid" data-action="create-prompt">
        <label class="field">
          <span>Type</span>
          <select name="type">
            ${promptTypeOptions("word_cloud")}
          </select>
        </label>
        <label class="field">
          <span>Rating max</span>
          <input name="scaleMax" type="number" min="3" max="10" value="5" />
        </label>
        <label class="field full">
          <span>Question</span>
          <input name="title" placeholder="What word describes the Sangat you want to build?" />
        </label>
        <label class="field full">
          <span>Description</span>
          <textarea name="description"></textarea>
        </label>
        <label class="field full">
          <span>Options for choice or ranking, one per line</span>
          <textarea name="options">Keertan
Vichaar
Small group
Seva</textarea>
        </label>
        <label class="field">
          <span>Moderation</span>
          <select name="moderate">
            <option value="true">Approve response wall text first</option>
            <option value="false">Show immediately</option>
          </select>
        </label>
        <label class="field">
          <span>Spectrum left</span>
          <input name="minLabel" value="More structure" />
        </label>
        <label class="field">
          <span>Spectrum right</span>
          <input name="maxLabel" value="More spaciousness" />
        </label>
        <label class="field">
          <span>Map left</span>
          <input name="xMinLabel" value="Unclear" />
        </label>
        <label class="field">
          <span>Map right</span>
          <input name="xMaxLabel" value="Clear" />
        </label>
        <label class="field">
          <span>Map bottom</span>
          <input name="yMinLabel" value="Closed" />
        </label>
        <label class="field">
          <span>Map top</span>
          <input name="yMaxLabel" value="Open" />
        </label>
        <div class="field">
          <span>&nbsp;</span>
          <button class="button" type="submit">Add prompt</button>
        </div>
      </form>
    </section>

    <section class="admin-section">
      <div class="section-head">
        <div>
          <span class="eyebrow">Selected prompt</span>
          <h2>${state.prompt ? escapeHtml(state.prompt.title) : "No prompt selected"}</h2>
        </div>
        <div class="toolbar">
          ${state.prompts.length ? `<button class="ghost-button" data-action="create-starter-pack" type="button">Add sample prompts</button>` : ""}
          ${state.prompt ? `<button class="button" data-action="open-prompt" type="button">${state.prompt.is_active ? "Live now" : "Open live"}</button>` : `<button class="button" data-action="create-starter-pack" type="button">Add sample prompts</button>`}
          ${state.prompt ? `<button class="danger-button" data-action="delete-prompt" type="button">Delete question</button>` : ""}
        </div>
      </div>
      ${state.prompt ? `
        <div class="toolbar">
          <span class="pill ${state.prompt.is_active ? "live" : ""}">${state.prompt.is_active ? "Live" : state.prompt.status}</span>
          <span class="pill">${escapeHtml(PROMPT_TYPES[effectivePromptType(state.prompt)] || effectivePromptType(state.prompt))}</span>
          <span class="pill">${state.responses.length} responses</span>
          <span class="pill">${escapeHtml(activityLabel(state.promptActivity.get(state.prompt.id)))}</span>
        </div>
        ${selectedPromptEditorHtml()}
        <section class="display-results">${resultsHtml(false)}</section>
        ${moderationHtml()}
      ` : `<div class="empty-state">Select or create a prompt.</div>`}
    </section>
  `;
}

function moderationHtml() {
  if (!state.prompt || effectivePromptType(state.prompt) !== "open_text") return "";
  return `
    <h2>Response moderation</h2>
    <div class="admin-response-grid">
      ${state.responses.map((response) => `
        <article class="admin-response-card ${response.is_approved ? "approved" : ""}">
          <div>${escapeHtml(response.value_text)}</div>
          <button class="ghost-button" data-response-id="${escapeHtml(response.id)}" data-approve="${response.is_approved ? "false" : "true"}" type="button">${response.is_approved ? "Hide" : "Approve"}</button>
        </article>
      `).join("") || `<div class="empty-state">No responses yet.</div>`}
    </div>
  `;
}

function promptGroupsHtml() {
  if (!state.prompts.length) return `<div class="empty-state">No prompts yet.</div>`;
  return `<div class="prompt-groups">${groupedPrompts().map((group) => `
    <section class="prompt-group">
      <div class="prompt-group-title">
        <span>${escapeHtml(group.label)}</span>
        <span>${group.prompts.length}</span>
      </div>
      <div class="prompt-list">
        ${group.prompts.map(({ prompt, number }) => {
          const activity = state.promptActivity.get(prompt.id) || { count: 0, lastAt: "" };
          return `
            <button class="list-button prompt-list-button ${prompt.id === state.prompt?.id ? "active" : ""}" data-prompt-id="${escapeHtml(prompt.id)}">
              <span class="prompt-number">${number}</span>
              <span>
                <strong>${escapeHtml(prompt.title)}</strong>
                <small>${prompt.is_active ? "Live now" : escapeHtml(prompt.status)} · ${activity.count} response${activity.count === 1 ? "" : "s"} · ${escapeHtml(activityLabel(activity))}</small>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `).join("")}</div>`;
}

function promptOptionsText() {
  return state.options.map((option) => option.label).join("\n");
}

function promptFormValues(form) {
  const data = new FormData(form);
  const type = data.get("type");
  const options = optionTypes(type)
    ? String(data.get("options") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    type,
    title: String(data.get("title") || "").trim(),
    description: String(data.get("description") || "").trim(),
    options,
    settings: {
      scaleMax: Number(data.get("scaleMax") || 5),
      moderate: data.get("moderate") === "true",
      minLabel: String(data.get("minLabel") || "").trim(),
      maxLabel: String(data.get("maxLabel") || "").trim(),
      xMinLabel: String(data.get("xMinLabel") || "").trim(),
      xMaxLabel: String(data.get("xMaxLabel") || "").trim(),
      yMinLabel: String(data.get("yMinLabel") || "").trim(),
      yMaxLabel: String(data.get("yMaxLabel") || "").trim(),
    },
  };
}

function validatePromptInput(input) {
  if (!input.title) return "Add a question before saving the prompt.";
  if (optionTypes(input.type) && input.options.length < 2) return "This prompt type needs at least two options.";
  return "";
}

function promptTypeOptions(selectedType) {
  return Object.entries(PROMPT_TYPES).map(([value, label]) => (
    `<option value="${escapeHtml(value)}" ${value === selectedType ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
}

function selectedPromptEditorHtml() {
  if (!state.prompt) return "";
  const moderate = state.prompt.settings?.moderate === true;
  const scaleMax = Number(state.prompt.settings?.scaleMax || 5);
  const spectrum = spectrumSettings(state.prompt.settings);
  const axis = axisSettings(state.prompt.settings);
  return `
    <form class="form-grid prompt-edit-form" data-action="update-prompt">
      <label class="field">
        <span>Type</span>
        <select name="type">${promptTypeOptions(effectivePromptType(state.prompt))}</select>
      </label>
      <label class="field">
        <span>Rating max</span>
        <input name="scaleMax" type="number" min="3" max="10" value="${escapeHtml(scaleMax)}" />
      </label>
      <label class="field full">
        <span>Question</span>
        <input name="title" value="${escapeHtml(state.prompt.title)}" />
      </label>
      <label class="field full">
        <span>Description</span>
        <textarea name="description">${escapeHtml(state.prompt.description || "")}</textarea>
      </label>
      <label class="field full">
        <span>Options for choice or ranking, one per line</span>
        <textarea name="options">${escapeHtml(promptOptionsText())}</textarea>
      </label>
      <label class="field">
        <span>Spectrum left</span>
        <input name="minLabel" value="${escapeHtml(spectrum.minLabel)}" />
      </label>
      <label class="field">
        <span>Spectrum right</span>
        <input name="maxLabel" value="${escapeHtml(spectrum.maxLabel)}" />
      </label>
      <label class="field">
        <span>Map left</span>
        <input name="xMinLabel" value="${escapeHtml(axis.xMinLabel)}" />
      </label>
      <label class="field">
        <span>Map right</span>
        <input name="xMaxLabel" value="${escapeHtml(axis.xMaxLabel)}" />
      </label>
      <label class="field">
        <span>Map bottom</span>
        <input name="yMinLabel" value="${escapeHtml(axis.yMinLabel)}" />
      </label>
      <label class="field">
        <span>Map top</span>
        <input name="yMaxLabel" value="${escapeHtml(axis.yMaxLabel)}" />
      </label>
      <label class="field">
        <span>Moderation</span>
        <select name="moderate">
          <option value="true" ${moderate ? "selected" : ""}>Approve response wall text first</option>
          <option value="false" ${!moderate ? "selected" : ""}>Show immediately</option>
        </select>
      </label>
      <div class="field">
        <span>&nbsp;</span>
        <button class="button" type="submit">Update prompt</button>
      </div>
    </form>
  `;
}

async function runAdminAction(action, successMessage = "") {
  try {
    await action();
    if (successMessage) state.status = successMessage;
    await refreshAdmin();
  } catch (error) {
    state.status = adminErrorMessage(error);
  }
  renderAdmin();
}

function attachAdminEvents() {
  app.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedSessionId = button.dataset.sessionId;
      await refreshAdmin();
      renderAdmin();
    });
  });
  app.querySelectorAll("[data-prompt-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.prompt = state.prompts.find((prompt) => prompt.id === button.dataset.promptId);
      state.options = await state.store.listOptions(state.prompt.id);
      state.responses = await state.store.listResponses(state.prompt.id);
      renderAdmin();
    });
  });
  app.querySelector("[data-action='create-session']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAdminAction(async () => {
      const data = new FormData(event.currentTarget);
      const session = await state.store.createSession({ code: data.get("code"), title: data.get("title") });
      state.selectedSessionId = session.id;
      await addSamplePrompts(session.id);
    }, "Session created with sample prompts.");
  });
  app.querySelector("[data-action='create-prompt']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = promptFormValues(event.currentTarget);
    const validation = validatePromptInput(input);
    if (validation) {
      state.status = validation;
      renderAdmin();
      return;
    }
    await runAdminAction(async () => {
      await state.store.createPrompt({ ...input, session_id: state.session.id });
    }, "Prompt added.");
  });
  app.querySelector("[data-action='update-prompt']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = promptFormValues(event.currentTarget);
    const validation = validatePromptInput(input);
    if (validation) {
      state.status = validation;
      renderAdmin();
      return;
    }
    await runAdminAction(async () => {
      await state.store.updatePrompt(state.prompt.id, input);
    }, "Prompt updated.");
  });
  app.querySelectorAll("[data-action='create-starter-pack']").forEach((button) => {
    button.addEventListener("click", async () => {
      await runAdminAction(async () => {
        await createStarterPack();
      }, "Sample prompts added.");
    });
  });
  app.querySelector("[data-action='open-prompt']")?.addEventListener("click", async () => {
    await runAdminAction(async () => {
      await state.store.setActivePrompt(state.session.id, state.prompt.id);
    });
  });
  app.querySelector("[data-action='close-prompts']")?.addEventListener("click", async () => {
    await runAdminAction(async () => {
      await state.store.closeSessionPrompts(state.session.id);
    }, "Prompt closed.");
  });
  app.querySelector("[data-action='close-session']")?.addEventListener("click", async () => {
    if (!state.session) return;
    const shouldClose = window.confirm(`Close session ${state.session.code}? Participants will no longer be able to join it.`);
    if (!shouldClose) return;
    await runAdminAction(async () => {
      const closedId = state.session.id;
      await state.store.archiveSession(closedId);
      state.selectedSessionId = null;
      state.session = null;
      state.prompt = null;
    }, "Session closed.");
  });
  app.querySelector("[data-action='delete-prompt']")?.addEventListener("click", async () => {
    if (!state.prompt) return;
    const shouldDelete = window.confirm(`Delete "${state.prompt.title}" and its responses?`);
    if (!shouldDelete) return;
    await runAdminAction(async () => {
      const deletedId = state.prompt.id;
      await state.store.deletePrompt(deletedId);
      state.selectedSessionId = state.session.id;
      state.prompt = null;
    }, "Question deleted.");
  });
  app.querySelector("[data-action='copy-participant']")?.addEventListener("click", async () => {
    await copyText(participantUrl(state.session.code), "Participant link copied.");
    renderAdmin();
  });
  app.querySelector("[data-action='copy-display']")?.addEventListener("click", async () => {
    await copyText(displayUrl(state.session.code), "Display link copied.");
    renderAdmin();
  });
  app.querySelector("[data-action='export-csv']")?.addEventListener("click", () => exportCsv());
  app.querySelectorAll("[data-response-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runAdminAction(async () => {
        await state.store.setResponseApproval(button.dataset.responseId, button.dataset.approve === "true");
      });
    });
  });
}

async function createStarterPack() {
  await addSamplePrompts(state.session.id);
}

async function addSamplePrompts(sessionId) {
  for (const prompt of SAMPLE_PROMPTS) {
    await state.store.createPrompt({ ...prompt, session_id: sessionId });
  }
}

function resultsHtml(forDisplay) {
  if (!state.prompt) return "";
  if (!state.responses.length) return `<div class="empty-state">Waiting for responses.</div>`;
  const type = effectivePromptType(state.prompt);
  if (type === "multiple_choice") return multipleChoiceResults();
  if (type === "rating") return ratingResults();
  if (type === "open_text") return responseWall(forDisplay);
  if (type === "reflection_map") return reflectionMapResults();
  if (type === "spectrum") return spectrumResults();
  if (type === "ranking") return rankingResults();
  return wordCloudResults();
}

function multipleChoiceResults() {
  const counts = new Map(state.options.map((option) => [option.id, 0]));
  state.responses.forEach((response) => counts.set(response.value_json?.option_id, (counts.get(response.value_json?.option_id) || 0) + 1));
  const max = Math.max(...counts.values(), 1);
  return `<div class="bar-list">${state.options.map((option) => {
    const count = counts.get(option.id) || 0;
    const pct = Math.round((count / Math.max(state.responses.length, 1)) * 100);
    return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(option.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(2, count / max * 100)}%"></div></div>
        <div class="bar-value">${pct}%</div>
      </div>
    `;
  }).join("")}</div>`;
}

function ratingResults() {
  const maxRating = Number(state.prompt.settings?.scaleMax || 5);
  const values = state.responses.map((response) => Number(response.value_json?.rating || 0)).filter(Boolean);
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const counts = Array.from({ length: maxRating }, (_, index) => values.filter((value) => value === index + 1).length);
  const max = Math.max(...counts, 1);
  return `
    <div class="bar-list">
      <div class="bar-row">
        <div class="bar-label">Average</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${avg / maxRating * 100}%"></div></div>
        <div class="bar-value">${avg.toFixed(1)}</div>
      </div>
      ${counts.map((count, index) => `
        <div class="bar-row">
          <div class="bar-label">${index + 1}</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(2, count / max * 100)}%"></div></div>
          <div class="bar-value">${count}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function wordCloudResults() {
  const counts = new Map();
  state.responses.forEach((response) => {
    String(response.value_text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 42);
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return `<div class="word-cloud">${entries.map(([word, count], index) => {
    const size = 24 + (count / max) * 54;
    const color = index % 5 === 0 ? "var(--basanti-500)" : "var(--white)";
    return `<span style="font-size:${size}px;color:${color}">${escapeHtml(word)}</span>`;
  }).join("")}</div>`;
}

function responseWall(forDisplay) {
  const visible = state.responses.filter((response) => !forDisplay || response.is_approved).slice(-12);
  return `<div class="response-wall">${visible.map((response) => `<article class="response-card">${escapeHtml(response.value_text)}</article>`).join("") || `<div class="empty-state">Waiting for approved responses.</div>`}</div>`;
}

function reflectionMapResults() {
  const labels = axisSettings(state.prompt.settings);
  const points = state.responses
    .map((response) => ({
      x: Number(response.value_json?.x),
      y: Number(response.value_json?.y),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) return `<div class="empty-state">Waiting for responses.</div>`;

  const avg = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  avg.x /= points.length;
  avg.y /= points.length;

  return `
    <div class="map-results">
      <div class="map-label map-label-top">${escapeHtml(labels.yMaxLabel)}</div>
      <div class="map-label map-label-bottom">${escapeHtml(labels.yMinLabel)}</div>
      <div class="map-label map-label-left">${escapeHtml(labels.xMinLabel)}</div>
      <div class="map-label map-label-right">${escapeHtml(labels.xMaxLabel)}</div>
      <div class="map-plane">
        ${points.map((point, index) => `<span class="map-dot" style="left:${point.x}%;bottom:${point.y}%;--i:${index % 7}"></span>`).join("")}
        <span class="map-average" style="left:${avg.x}%;bottom:${avg.y}%">avg</span>
      </div>
    </div>
  `;
}

function spectrumResults() {
  const labels = spectrumSettings(state.prompt.settings);
  const values = state.responses
    .map((response) => Number(response.value_json?.value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return `<div class="empty-state">Waiting for responses.</div>`;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

  return `
    <div class="spectrum-results">
      <div class="spectrum-result-labels"><span>${escapeHtml(labels.minLabel)}</span><span>${escapeHtml(labels.maxLabel)}</span></div>
      <div class="spectrum-track">
        ${values.map((value, index) => `<span class="spectrum-dot" style="left:${value}%;--i:${index % 7}"></span>`).join("")}
        <span class="spectrum-average" style="left:${avg}%">avg</span>
      </div>
      <div class="spectrum-average-readout">${Math.round(avg)}%</div>
    </div>
  `;
}

function rankingResults() {
  if (!state.options.length) return `<div class="empty-state">Add options to show ranking results.</div>`;
  const scores = new Map(state.options.map((option) => [option.id, { option, points: 0, votes: 0 }]));
  const maxPoints = state.options.length;
  state.responses.forEach((response) => {
    const ranking = response.value_json?.ranking || [];
    ranking.forEach((optionId, index) => {
      const score = scores.get(optionId);
      if (score) {
        score.points += maxPoints - index;
        score.votes += 1;
      }
    });
  });
  const rows = [...scores.values()].sort((a, b) => b.points - a.points);
  const max = Math.max(...rows.map((row) => row.points), 1);
  return `<div class="ranking-results">${rows.map((row, index) => {
    const pct = Math.max(2, row.points / max * 100);
    return `
      <div class="ranking-row">
        <div class="ranking-place">${index + 1}</div>
        <div class="bar-label">${escapeHtml(row.option.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${pct}%"></div></div>
        <div class="bar-value">${row.points}</div>
      </div>
    `;
  }).join("")}</div>`;
}

function exportCsv() {
  const rows = [["session_code", "prompt", "prompt_type", "response", "approved", "created_at"]];
  state.responses.forEach((response) => {
    const value = response.value_text || JSON.stringify(response.value_json || {});
    rows.push([state.session.code, state.prompt.title, effectivePromptType(state.prompt), value, response.is_approved ? "yes" : "no", response.created_at || ""]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.session.code}-${state.prompt?.type || "responses"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportFeedbackCsv() {
  const rows = [[
    "session_code",
    "name",
    "contact",
    "overall_rating",
    "sangat_rating",
    "gurmat_rating",
    "workshop_rating",
    "recommend",
    "returning",
    "meaningful",
    "improve",
    "workshop_logistics",
    "additional",
    "created_at",
  ]];
  state.feedback.forEach((entry) => {
    rows.push([
      state.session?.code || "",
      entry.name || "",
      entry.contact || "",
      entry.overall_rating || "",
      entry.sangat_rating || "",
      entry.gurmat_rating || "",
      entry.workshop_rating || "",
      entry.recommend || "",
      entry.returning || "",
      entry.favorite_text || "",
      entry.improve_text || "",
      entry.workshop_text || "",
      entry.additional_text || "",
      entry.created_at || "",
    ]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.session?.code || "retreat"}-feedback.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderError(message) {
  app.innerHTML = `
    <main class="waiting">
      <div>
        <p class="eyebrow">Something needs attention</p>
        <h1>Could not load SYANA Live.</h1>
        <p>${escapeHtml(message)}</p>
        <a class="button" href="./">Return</a>
      </div>
    </main>
  `;
}

init();
