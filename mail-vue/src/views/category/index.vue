<template>
  <div class="category-page" :class="{ 'has-progress': reclassifyProgress }">
    <div class="toolbar">
      <div class="title">{{ t('mailCategory') }}</div>
      <div class="actions">
        <el-button v-perm="'category:set'" type="primary" @click="openCategoryForm()">
          {{ t('addCategory') }}
        </el-button>
        <el-button v-perm="'category:set'" :loading="reclassifyLoading" @click="reclassifyAll">
          {{ t('reclassifyEmails') }}
        </el-button>
      </div>
    </div>
    <div class="progress-line" v-if="reclassifyProgress">{{ reclassifyProgress }}</div>

    <div class="content-grid">
      <el-card class="category-card" shadow="never">
        <template #header>
          <div class="card-header">
            <span>{{ t('categoryList') }}</span>
            <span class="hint">{{ categories.length }}</span>
          </div>
        </template>
        <el-table
            v-loading="loading"
            :data="categories"
            height="calc(100vh - 235px)"
            highlight-current-row
            :row-class-name="categoryRowClassName"
            @row-click="selectCategory"
        >
          <el-table-column prop="name" :label="t('categoryName')" min-width="130">
            <template #default="props">
              <div class="category-name">
                <span class="color-dot" :style="{ background: props.row.color || '#409EFF' }"></span>
                <span>{{ props.row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="ruleList" :label="t('rules')" width="70">
            <template #default="props">{{ props.row.ruleList?.length || 0 }}</template>
          </el-table-column>
          <el-table-column prop="enabled" :label="t('status')" width="82">
            <template #default="props">
              <el-tag size="small" :type="props.row.enabled ? 'success' : 'info'">
                {{ props.row.enabled ? t('enabled') : t('disabled') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('operation')" width="118">
            <template #default="props">
              <el-button v-perm="'category:set'" link type="primary" @click.stop="openCategoryForm(props.row)">
                {{ t('edit') }}
              </el-button>
              <el-button v-perm="'category:set'" link type="danger" @click.stop="deleteCategoryRow(props.row)">
                {{ t('delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="rule-card" shadow="never">
        <template #header>
          <div class="card-header">
            <span>{{ currentCategory ? currentCategory.name : t('categoryRules') }}</span>
            <el-button v-perm="'category:set'" type="primary" size="small" :disabled="!currentCategory" @click="openRuleForm()">
              {{ t('addRule') }}
            </el-button>
          </div>
        </template>
        <el-empty v-if="!currentCategory" :description="t('selectCategoryFirst')" />
        <el-table v-else :data="currentCategory.ruleList || []" height="calc(100vh - 235px)">
          <el-table-column prop="field" :label="t('matchField')" width="120">
            <template #default="props">{{ fieldLabel(props.row.field) }}</template>
          </el-table-column>
          <el-table-column prop="matchType" :label="t('matchType')" width="110">
            <template #default="props">{{ matchTypeLabel(props.row.matchType) }}</template>
          </el-table-column>
          <el-table-column prop="keyword" :label="t('keyword')" min-width="170" show-overflow-tooltip />
          <el-table-column prop="priority" :label="t('priority')" width="80" />
          <el-table-column prop="enabled" :label="t('status')" width="82">
            <template #default="props">
              <el-tag size="small" :type="props.row.enabled ? 'success' : 'info'">
                {{ props.row.enabled ? t('enabled') : t('disabled') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('operation')" width="118">
            <template #default="props">
              <el-button v-perm="'category:set'" link type="primary" @click="openRuleForm(props.row)">
                {{ t('edit') }}
              </el-button>
              <el-button v-perm="'category:set'" link type="danger" @click="deleteRuleRow(props.row)">
                {{ t('delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog v-model="categoryFormShow" :title="categoryForm.categoryId ? t('editCategory') : t('addCategory')" width="min(420px, calc(100vw - 24px))">
      <el-form label-position="top">
        <el-form-item :label="t('categoryName')">
          <el-input v-model="categoryForm.name" />
        </el-form-item>
        <el-form-item :label="t('categoryColor')">
          <el-color-picker v-model="categoryForm.color" />
        </el-form-item>
        <el-form-item :label="t('sort')">
          <el-input-number v-model="categoryForm.sort" :min="-9999" :max="9999" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('status')">
          <el-switch v-model="categoryForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryFormShow = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveCategory">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ruleFormShow" :title="ruleForm.ruleId ? t('editRule') : t('addRule')" width="min(460px, calc(100vw - 24px))">
      <el-form label-position="top">
        <el-form-item :label="t('matchField')">
          <el-select v-model="ruleForm.field" style="width: 100%">
            <el-option v-for="item in fieldOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('matchType')">
          <el-select v-model="ruleForm.matchType" style="width: 100%">
            <el-option v-for="item in matchTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('keyword')">
          <el-input v-model="ruleForm.keyword" />
        </el-form-item>
        <el-form-item :label="t('priority')">
          <el-input-number v-model="ruleForm.priority" :min="-9999" :max="9999" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('caseSensitive')">
          <el-switch v-model="ruleForm.caseSensitive" />
        </el-form-item>
        <el-form-item :label="t('status')">
          <el-switch v-model="ruleForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleFormShow = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveRule">{{ t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref} from "vue";
import {useI18n} from "vue-i18n";
import {sleep} from "@/utils/time-utils.js";
import {
  categoryAdd,
  categoryDelete,
  categoryList,
  categoryReclassify,
  categoryRuleAdd,
  categoryRuleDelete,
  categoryRuleUpdate,
  categoryUpdate
} from "@/request/category.js";

defineOptions({
  name: 'category'
})

const {t} = useI18n()
const loading = ref(false)
const saveLoading = ref(false)
const reclassifyLoading = ref(false)
const reclassifyProgress = ref('')
const categoryFormShow = ref(false)
const ruleFormShow = ref(false)
const categories = ref([])
const currentCategoryId = ref(null)
const categoryForm = reactive(defaultCategoryForm())
const ruleForm = reactive(defaultRuleForm())

const currentCategory = computed(() => categories.value.find(item => item.categoryId === currentCategoryId.value))

const fieldOptions = computed(() => [
  {label: t('subject'), value: 'subject'},
  {label: t('sendEmailAddress'), value: 'sendEmail'},
  {label: t('sender'), value: 'name'},
  {label: t('toEmail'), value: 'toEmail'},
  {label: t('textContent'), value: 'text'},
  {label: t('htmlContent'), value: 'content'},
  {label: t('allFields'), value: 'all'},
])

const matchTypeOptions = computed(() => [
  {label: t('equal'), value: 'eq'},
  {label: t('include'), value: 'include'},
  {label: t('leading'), value: 'left'},
  {label: t('trailing'), value: 'right'},
  {label: t('regex'), value: 'regex'},
])

onMounted(() => {
  loadCategories()
})

function defaultCategoryForm() {
  return {
    categoryId: null,
    name: '',
    color: '#409EFF',
    icon: '',
    sort: 0,
    enabled: true
  }
}

function defaultRuleForm() {
  return {
    ruleId: null,
    categoryId: null,
    field: 'subject',
    matchType: 'include',
    keyword: '',
    caseSensitive: false,
    enabled: true,
    priority: 0
  }
}

function loadCategories() {
  loading.value = true
  categoryList().then(list => {
    categories.value = list
    if (!currentCategoryId.value && list.length > 0) {
      currentCategoryId.value = list[0].categoryId
    }
    if (currentCategoryId.value && !list.some(item => item.categoryId === currentCategoryId.value)) {
      currentCategoryId.value = list[0]?.categoryId || null
    }
  }).finally(() => {
    loading.value = false
  })
}

function selectCategory(category) {
  currentCategoryId.value = category.categoryId
}

function categoryRowClassName({row}) {
  return row.categoryId === currentCategoryId.value ? 'current-category-row' : ''
}

function openCategoryForm(category = null) {
  Object.assign(categoryForm, defaultCategoryForm(), category || {})
  categoryForm.enabled = Boolean(categoryForm.enabled)
  categoryFormShow.value = true
}

function saveCategory() {
  saveLoading.value = true
  const request = categoryForm.categoryId ? categoryUpdate : categoryAdd
  request({...categoryForm}).then((category) => {
    categoryFormShow.value = false
    currentCategoryId.value = category.categoryId
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
    loadCategories()
  }).finally(() => {
    saveLoading.value = false
  })
}

function deleteCategoryRow(category) {
  ElMessageBox.confirm(t('deleteCategoryConfirm', {name: category.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    categoryDelete(category.categoryId).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      if (currentCategoryId.value === category.categoryId) {
        currentCategoryId.value = null
      }
      loadCategories()
    })
  })
}

function openRuleForm(rule = null) {
  if (!currentCategory.value) return;
  Object.assign(ruleForm, defaultRuleForm(), rule || {}, {categoryId: currentCategory.value.categoryId})
  ruleForm.caseSensitive = Boolean(ruleForm.caseSensitive)
  ruleForm.enabled = Boolean(ruleForm.enabled)
  ruleFormShow.value = true
}

function saveRule() {
  saveLoading.value = true
  const request = ruleForm.ruleId ? categoryRuleUpdate : categoryRuleAdd
  request({...ruleForm}).then(() => {
    ruleFormShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
    loadCategories()
  }).finally(() => {
    saveLoading.value = false
  })
}

function deleteRuleRow(rule) {
  ElMessageBox.confirm(t('deleteRuleConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    categoryRuleDelete(rule.ruleId).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      loadCategories()
    })
  })
}

async function reclassifyAll() {
  reclassifyLoading.value = true
  let lastEmailId = 0
  let total = 0
  let totalMatched = null

  try {
    while (true) {
      const data = await categoryReclassify({
        lastEmailId,
        size: 500,
        clearOld: true,
        withTotal: totalMatched == null ? 1 : 0
      })
      total += data.processed
      lastEmailId = data.lastEmailId
      if (totalMatched == null) {
        totalMatched = Number(data.totalMatched ?? total)
      }
      if (totalMatched > 0) {
        reclassifyProgress.value = t('reclassifyProgressWithTotal', {
          count: total,
          total: totalMatched,
          percent: Math.min(100, Math.floor((total / totalMatched) * 100))
        })
      } else {
        reclassifyProgress.value = t('reclassifyProgress', {count: total})
      }
      if (data.finished) break;
      await sleep(80)
    }

    ElMessage({
      message: t('reclassifySuccess', {count: total}),
      type: 'success',
      plain: true
    })
  } finally {
    reclassifyLoading.value = false
    reclassifyProgress.value = ''
  }
}

function fieldLabel(value) {
  return fieldOptions.value.find(item => item.value === value)?.label || value
}

function matchTypeLabel(value) {
  return matchTypeOptions.value.find(item => item.value === value)?.label || value
}
</script>

<style scoped lang="scss">
.category-page {
  height: 100%;
  overflow: hidden;
  padding: 18px;

  &.has-progress {
    .content-grid {
      height: calc(100% - 78px);
    }
  }
}

.toolbar {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;

  .title {
    font-size: 20px;
    font-weight: 700;
  }

  .actions {
    display: flex;
    gap: 10px;
  }
}

.progress-line {
  color: var(--secondary-text-color);
  font-size: 13px;
  margin: -6px 0 12px;
}

.content-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.3fr);
  height: calc(100% - 52px);
}

.card-header {
  align-items: center;
  display: flex;
  justify-content: space-between;

  .hint {
    color: var(--secondary-text-color);
    font-size: 12px;
  }
}

.category-name {
  align-items: center;
  display: flex;
  gap: 8px;

  .color-dot {
    border-radius: 50%;
    flex: 0 0 auto;
    height: 10px;
    width: 10px;
  }
}

:deep(.current-category-row) {
  background: var(--light-ill);
}

@media (max-width: 900px) {
  .category-page {
    overflow: auto;
    padding: 12px;
  }

  .toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .content-grid {
    grid-template-columns: 1fr;
    height: auto;
  }
}
</style>
