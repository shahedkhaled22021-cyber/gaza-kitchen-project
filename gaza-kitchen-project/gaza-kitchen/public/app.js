const state = {
  recipes: [],
  adminRecipes: [],
  stats: null,
  editingId: null
};

const recipesGrid = document.getElementById('recipesGrid');
const wartimeGrid = document.getElementById('wartimeGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const searchBtn = document.getElementById('searchBtn');
const recipeModal = document.getElementById('recipeModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(data?.message || 'حدث خطأ');
  return data;
}

function recipeCard(recipe) {
  return `
    <article class="recipe-card">
      <img src="${recipe.image}" alt="${recipe.name}">
      <div class="recipe-body">
        <div class="recipe-meta">
          <span>${recipe.category === 'wartime' ? 'وصفة حرب' : 'وصفة تقليدية'}</span>
          <span>${recipe.prepTime}</span>
        </div>
        <h3>${recipe.name}</h3>
        <p>${recipe.shortDescription}</p>
        <div class="tags">${(recipe.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
        <button class="btn btn-primary small" onclick="showRecipe('${recipe.id}')">عرض التفاصيل</button>
      </div>
    </article>
  `;
}

function renderRecipes() {
  const category = categoryFilter.value;
  const term = searchInput.value.trim().toLowerCase();
  const filtered = state.recipes.filter((recipe) => {
    const matchesCategory = category === 'all' || recipe.category === category;
    const text = [recipe.name, recipe.shortDescription, ...(recipe.ingredients || []), ...(recipe.tags || [])].join(' ').toLowerCase();
    const matchesSearch = !term || text.includes(term);
    return matchesCategory && matchesSearch;
  });

  recipesGrid.innerHTML = filtered.length
    ? filtered.map(recipeCard).join('')
    : `<div class="empty-state">لا توجد نتائج مطابقة للبحث.</div>`;

  const wartime = state.recipes.filter((recipe) => recipe.category === 'wartime');
  wartimeGrid.innerHTML = wartime.length
    ? wartime.map(recipeCard).join('')
    : `<div class="empty-state">لا توجد وصفات حرب حتى الآن.</div>`;
}

async function loadRecipes() {
  state.recipes = await api('/api/recipes');
  renderRecipes();
}

window.showRecipe = async function(id) {
  const recipe = await api(`/api/recipes/${id}`);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img src="${recipe.image}" alt="${recipe.name}">
      <div>
        <span class="badge">${recipe.category === 'wartime' ? 'وصفة حرب' : 'وصفة تقليدية'}</span>
        <h2>${recipe.name}</h2>
        <p>${recipe.shortDescription}</p>
        <p><strong>مدة التحضير:</strong> ${recipe.prepTime}</p>
        <p><strong>القصة:</strong> ${recipe.story || 'لا توجد قصة إضافية.'}</p>
      </div>
      <div>
        <h3>المكونات</h3>
        <ul>${recipe.ingredients.map(item => `<li>${item}</li>`).join('')}</ul>
      </div>
      <div>
        <h3>الخطوات</h3>
        <ol>${recipe.steps.map(item => `<li>${item}</li>`).join('')}</ol>
      </div>
    </div>
  `;
  recipeModal.classList.remove('hidden');
  loadStatsIfVisible();
};

closeModal.addEventListener('click', () => recipeModal.classList.add('hidden'));
recipeModal.addEventListener('click', (e) => {
  if (e.target === recipeModal) recipeModal.classList.add('hidden');
});

searchBtn.addEventListener('click', async () => {
  const term = searchInput.value.trim();
  if (term) {
    try {
      await api('/api/search-log', { method: 'POST', body: JSON.stringify({ term }) });
    } catch (error) {}
  }
  renderRecipes();
  loadStatsIfVisible();
});

categoryFilter.addEventListener('change', renderRecipes);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchBtn.click();
});

async function loadPublicStats() {
  try {
    const isAdmin = await api('/api/admin/check');
    if (isAdmin.isAdmin) {
      await loadAdminStats();
    }
  } catch (error) {}
}

function fillStats(stats) {
  document.getElementById('totalRecipes').textContent = stats.totalRecipes || 0;
  document.getElementById('totalVisits').textContent = stats.totalVisits || 0;
  document.getElementById('uniqueVisitors').textContent = stats.uniqueVisitors || 0;
  document.getElementById('wartimeCount').textContent = stats.wartimeCount || 0;
  document.getElementById('heroRecipesCount').textContent = stats.totalRecipes || 0;
  document.getElementById('heroVisitsCount').textContent = stats.totalVisits || 0;
  document.getElementById('topSearchesList').innerHTML = (stats.topSearches?.length ? stats.topSearches : [{term: 'لا يوجد', count: 0}])
    .map(item => `<li><strong>${item.term}</strong> — ${item.count}</li>`).join('');
  document.getElementById('topViewedList').innerHTML = (stats.topViewedRecipes?.length ? stats.topViewedRecipes : [{name: 'لا يوجد', views: 0}])
    .map(item => `<li><strong>${item.name}</strong> — ${item.views}</li>`).join('');
}

async function loadAdminStats() {
  try {
    const stats = await api('/api/admin/stats');
    state.stats = stats;
    fillStats(stats);
    renderAdminStats(stats);
  } catch (error) {}
}

function renderAdminStats(stats) {
  document.getElementById('recentActionsList').innerHTML = (stats.recentAdminActions?.length ? stats.recentAdminActions : [{details: 'لا يوجد نشاط بعد', at: ''}])
    .map(item => `<li><strong>${item.details}</strong><br><small>${item.at ? new Date(item.at).toLocaleString('ar-EG') : ''}</small></li>`).join('');

  document.getElementById('quickSummary').innerHTML = `
    <div class="small-box"><strong>${stats.traditionalCount}</strong><span> وصفات تقليدية</span></div>
    <div class="small-box"><strong>${stats.wartimeCount}</strong><span> وصفات حرب</span></div>
    <div class="small-box"><strong>${stats.topSearches?.[0]?.term || '—'}</strong><span> أكثر كلمة بحثًا</span></div>
    <div class="small-box"><strong>${stats.topViewedRecipes?.[0]?.name || '—'}</strong><span> الأكثر مشاهدة</span></div>
  `;
}

function loadStatsIfVisible() {
  if (!document.getElementById('adminPanel').classList.contains('hidden')) {
    loadAdminStats();
  }
}

const adminLoginCard = document.getElementById('adminLoginCard');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');
const recipeForm = document.getElementById('recipeForm');
const cancelEditBtn = document.getElementById('cancelEditBtn');

async function checkAdmin() {
  try {
    const result = await api('/api/admin/check');
    if (result.isAdmin) {
      adminLoginCard.classList.add('hidden');
      adminPanel.classList.remove('hidden');
      await loadAdminData();
    }
  } catch (error) {}
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('adminEmail').value,
        password: document.getElementById('adminPassword').value
      })
    });
    loginMessage.textContent = 'تم تسجيل الدخول بنجاح.';
    adminLoginCard.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    await loadAdminData();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  adminPanel.classList.add('hidden');
  adminLoginCard.classList.remove('hidden');
  loginMessage.textContent = '';
  recipeForm.reset();
});

function getFormData() {
  return {
    name: document.getElementById('recipeName').value,
    category: document.getElementById('recipeCategory').value,
    image: document.getElementById('recipeImage').value,
    prepTime: document.getElementById('recipePrepTime').value,
    shortDescription: document.getElementById('recipeShortDescription').value,
    story: document.getElementById('recipeStory').value,
    ingredients: document.getElementById('recipeIngredients').value,
    steps: document.getElementById('recipeSteps').value,
    tags: document.getElementById('recipeTags').value
  };
}

recipeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = getFormData();
  if (state.editingId) {
    await api(`/api/admin/recipes/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await api('/api/admin/recipes', { method: 'POST', body: JSON.stringify(payload) });
  }
  resetForm();
  await loadAdminData();
  await loadRecipes();
});

cancelEditBtn.addEventListener('click', resetForm);

function resetForm() {
  state.editingId = null;
  recipeForm.reset();
  document.getElementById('formTitle').textContent = 'إضافة وصفة جديدة';
}

async function loadAdminData() {
  const recipes = await api('/api/admin/recipes');
  state.adminRecipes = recipes;
  renderAdminRecipes();
  await loadAdminStats();
}

function renderAdminRecipes() {
  const list = document.getElementById('adminRecipesList');
  list.innerHTML = state.adminRecipes.map(recipe => `
    <div class="admin-item">
      <div class="admin-item-top">
        <div>
          <strong>${recipe.name}</strong>
          <p>${recipe.category === 'wartime' ? 'وصفة حرب' : 'وصفة تقليدية'} • ${recipe.prepTime}</p>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-secondary small" onclick="editRecipe('${recipe.id}')">تعديل</button>
          <button class="btn btn-primary small" onclick="deleteRecipe('${recipe.id}')">حذف</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.editRecipe = function(id) {
  const recipe = state.adminRecipes.find(item => item.id === id);
  if (!recipe) return;
  state.editingId = id;
  document.getElementById('formTitle').textContent = 'تعديل الوصفة';
  document.getElementById('recipeName').value = recipe.name;
  document.getElementById('recipeCategory').value = recipe.category;
  document.getElementById('recipeImage').value = recipe.image;
  document.getElementById('recipePrepTime').value = recipe.prepTime;
  document.getElementById('recipeShortDescription').value = recipe.shortDescription;
  document.getElementById('recipeStory').value = recipe.story;
  document.getElementById('recipeIngredients').value = recipe.ingredients.join('\n');
  document.getElementById('recipeSteps').value = recipe.steps.join('\n');
  document.getElementById('recipeTags').value = (recipe.tags || []).join('\n');
  document.getElementById('admin').scrollIntoView({ behavior: 'smooth' });
};

window.deleteRecipe = async function(id) {
  const ok = confirm('هل أنت متأكد من حذف الوصفة؟');
  if (!ok) return;
  await api(`/api/admin/recipes/${id}`, { method: 'DELETE' });
  await loadAdminData();
  await loadRecipes();
};

(async function init() {
  await loadRecipes();
  await checkAdmin();
  await loadPublicStats();
})();
