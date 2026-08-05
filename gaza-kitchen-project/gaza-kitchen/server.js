const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gazakitchen.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const SESSION_SECRET = process.env.SESSION_SECRET || 'gaza-kitchen-secret';

const DATA_DIR = path.join(__dirname, 'data');
const RECIPES_FILE = path.join(DATA_DIR, 'recipes.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use((req, res, next) => {
  ensureAnalytics();
  const analytics = readJson(ANALYTICS_FILE, defaultAnalytics());
  analytics.totalVisits += 1;
  analytics.uniqueVisitors = Array.isArray(analytics.uniqueVisitorHashes) ? analytics.uniqueVisitorHashes.length : 0;

  const fingerprint = crypto
    .createHash('sha256')
    .update(`${req.ip}-${req.headers['user-agent'] || 'unknown'}`)
    .digest('hex');

  analytics.pageViews[req.path] = (analytics.pageViews[req.path] || 0) + 1;
  if (!analytics.uniqueVisitorHashes.includes(fingerprint)) {
    analytics.uniqueVisitorHashes.push(fingerprint);
    analytics.uniqueVisitors = analytics.uniqueVisitorHashes.length;
  }
  writeJson(ANALYTICS_FILE, analytics);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

function ensureAnalytics() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RECIPES_FILE)) writeJson(RECIPES_FILE, []);
  if (!fs.existsSync(ANALYTICS_FILE)) writeJson(ANALYTICS_FILE, defaultAnalytics());
}

function defaultAnalytics() {
  return {
    totalVisits: 0,
    uniqueVisitors: 0,
    uniqueVisitorHashes: [],
    searches: {},
    recipeViews: {},
    pageViews: {},
    adminActions: []
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readRecipes() {
  return readJson(RECIPES_FILE, []);
}

function writeRecipes(recipes) {
  writeJson(RECIPES_FILE, recipes);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ message: 'غير مصرح' });
}

function logAdminAction(type, details) {
  const analytics = readJson(ANALYTICS_FILE, defaultAnalytics());
  analytics.adminActions.unshift({
    type,
    details,
    at: new Date().toISOString()
  });
  analytics.adminActions = analytics.adminActions.slice(0, 20);
  writeJson(ANALYTICS_FILE, analytics);
}

app.get('/api/recipes', (req, res) => {
  const { category = 'all', search = '' } = req.query;
  const recipes = readRecipes();
  let filtered = recipes;

  if (category !== 'all') {
    filtered = filtered.filter((recipe) => recipe.category === category);
  }

  if (search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter((recipe) => {
      const haystack = [
        recipe.name,
        recipe.shortDescription,
        ...(recipe.ingredients || []),
        ...(recipe.tags || [])
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }

  res.json(filtered);
});

app.get('/api/recipes/:id', (req, res) => {
  const recipes = readRecipes();
  const recipe = recipes.find((item) => item.id === req.params.id);
  if (!recipe) return res.status(404).json({ message: 'الوصفة غير موجودة' });

  const analytics = readJson(ANALYTICS_FILE, defaultAnalytics());
  analytics.recipeViews[recipe.id] = (analytics.recipeViews[recipe.id] || 0) + 1;
  writeJson(ANALYTICS_FILE, analytics);

  res.json(recipe);
});

app.post('/api/search-log', (req, res) => {
  const term = String(req.body.term || '').trim().toLowerCase();
  if (term) {
    const analytics = readJson(ANALYTICS_FILE, defaultAnalytics());
    analytics.searches[term] = (analytics.searches[term] || 0) + 1;
    writeJson(ANALYTICS_FILE, analytics);
  }
  res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    logAdminAction('login', 'تم تسجيل دخول الأدمن');
    return res.json({ ok: true, message: 'تم تسجيل الدخول' });
  }
  return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: Boolean(req.session && req.session.isAdmin) });
});

app.get('/api/admin/recipes', requireAdmin, (req, res) => {
  res.json(readRecipes());
});

app.post('/api/admin/recipes', requireAdmin, (req, res) => {
  const recipes = readRecipes();
  const payload = normalizeRecipe(req.body);
  const newRecipe = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  recipes.unshift(newRecipe);
  writeRecipes(recipes);
  logAdminAction('create', `تمت إضافة وصفة: ${newRecipe.name}`);
  res.status(201).json(newRecipe);
});

app.put('/api/admin/recipes/:id', requireAdmin, (req, res) => {
  const recipes = readRecipes();
  const index = recipes.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'الوصفة غير موجودة' });
  recipes[index] = {
    ...recipes[index],
    ...normalizeRecipe(req.body),
    updatedAt: new Date().toISOString()
  };
  writeRecipes(recipes);
  logAdminAction('update', `تم تعديل وصفة: ${recipes[index].name}`);
  res.json(recipes[index]);
});

app.delete('/api/admin/recipes/:id', requireAdmin, (req, res) => {
  const recipes = readRecipes();
  const recipe = recipes.find((item) => item.id === req.params.id);
  if (!recipe) return res.status(404).json({ message: 'الوصفة غير موجودة' });
  const filtered = recipes.filter((item) => item.id !== req.params.id);
  writeRecipes(filtered);
  logAdminAction('delete', `تم حذف وصفة: ${recipe.name}`);
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const recipes = readRecipes();
  const analytics = readJson(ANALYTICS_FILE, defaultAnalytics());

  const topSearches = Object.entries(analytics.searches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term, count]) => ({ term, count }));

  const topViewedRecipes = Object.entries(analytics.recipeViews)
    .map(([id, views]) => ({
      id,
      views,
      recipe: recipes.find((item) => item.id === id)
    }))
    .filter((item) => item.recipe)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      name: item.recipe.name,
      views: item.views
    }));

  res.json({
    totalRecipes: recipes.length,
    traditionalCount: recipes.filter((item) => item.category === 'traditional').length,
    wartimeCount: recipes.filter((item) => item.category === 'wartime').length,
    totalVisits: analytics.totalVisits,
    uniqueVisitors: analytics.uniqueVisitors,
    topSearches,
    topViewedRecipes,
    recentAdminActions: analytics.adminActions.slice(0, 8)
  });
});

function normalizeRecipe(body) {
  return {
    name: String(body.name || '').trim(),
    category: body.category === 'wartime' ? 'wartime' : 'traditional',
    image: String(body.image || '').trim(),
    prepTime: String(body.prepTime || '').trim(),
    ingredients: toArray(body.ingredients),
    steps: toArray(body.steps),
    tags: toArray(body.tags),
    shortDescription: String(body.shortDescription || '').trim(),
    story: String(body.story || '').trim()
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

// IMPORTANT: This must be the LAST route before 404 handler
// Serve static pages (if you have multiple HTML files)
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// Handle 404 - Page Not Found
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>404 - الصفحة غير موجودة</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f0ea; color: #2d2017; }
            h1 { font-size: 80px; margin: 0; color: #9b5b31; }
            a { color: #5f7d4c; text-decoration: none; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>٤٠٤</h1>
        <h2>الصفحة غير موجودة</h2>
        <p>عذراً، الصفحة التي تبحث عنها غير متوفرة.</p>
        <a href="/">🏠 العودة إلى الرئيسية</a>
    </body>
    </html>
  `);
});
app.listen(PORT, () => {
  console.log(`Gaza Kitchen running on http://localhost:${PORT}`);
});