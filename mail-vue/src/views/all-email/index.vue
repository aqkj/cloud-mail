<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 @category-search="handleCategorySearch"
                 allow-category-search
                 :type="'all-email'"

    >
      <template #first>
        <el-input
            v-model="searchValue"
            :placeholder="$t('searchByContent')"
            class="search-input"
        >
          <template #prefix>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="params.searchType"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option key="3" :label="$t('sender')" :value="'name'"/>
                <el-option key="4" :label="$t('subject')" :value="'subject'"/>
                <el-option key="1" :label="$t('user')" :value="'user'"/>
                <el-option key="2" :label="$t('selectEmail')" :value="'account'"/>
              </el-select>
              <div class="search-type">
                <span>{{ selectTitle }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-select v-model="params.type" placeholder="Select" class="status-select" @change="typeSelectChange">
          <el-option key="1" :label="$t('all')" value="all"/>
          <el-option key="3" :label="$t('received')" value="receive"/>
          <el-option key="2" :label="$t('sent')" value="send"/>
          <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
          <el-option key="4" :label="$t('noRecipientTitle')" value="noone"/>
        </el-select>
        <el-select
            v-if="hasPerm('category:query')"
            v-model="params.categoryId"
            :placeholder="$t('category')"
            class="category-select"
            clearable
            @change="categorySelectChange"
        >
          <el-option :label="$t('allCategories')" :value="null"/>
          <el-option :label="$t('uncategorized')" value="uncategorized"/>
          <el-option
              v-for="category in categories"
              :key="category.categoryId"
              :label="category.name"
              :value="category.categoryId"
          />
        </el-select>
        <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
        <Icon v-perm="'all-email:delete'" class="icon clear" icon="fluent:broom-sparkle-16-regular" width="22" height="22" @click="openBathDelete"/>
      </template>
    </emailScroll>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="min(390px, calc(100vw - 24px))"
               @closed="closedClear">
      <div class="clear-email" v-loading="autoCleanLoading">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
        <div class="auto-clean-desc" v-if="clearProgress">
          {{ clearProgress }}
        </div>
        <el-divider>{{ t('scheduledCleanup') }}</el-divider>
        <div class="auto-clean-switch">
          <el-switch v-model="autoCleanEnabled" :active-text="t('enableScheduledCleanup')" />
        </div>
        <div class="auto-clean-desc">
          {{ t('scheduledCleanupDesc') }}
        </div>
        <div class="auto-clean-desc" v-if="autoCleanConfig.lastRunTime">
          {{ t('scheduledCleanupLastRun', { time: autoCleanConfig.lastRunTime, count: autoCleanConfig.lastRunCount }) }}
        </div>
        <el-button :loading="autoCleanSaveLoading" type="success" @click="saveAutoClean">
          {{ t('saveScheduledCleanup') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailAutoClean,
  allEmailAutoCleanSet,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc, tzDayjs} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router'
import {EmailTypeEnum} from "@/enums/email-enum.js";
import {categoryList as categoryListReq} from "@/request/category.js";
import {hasPerm} from "@/perm/perm.js";

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const clearTime = ref(null)
const sysEmailScroll = ref({})
const categories = ref([])
const searchValue = ref('')
const mySelect = ref()
const showBathDelete = ref(false)
const clearLoading = ref(false)
const clearProgress = ref('')
const autoCleanLoading = ref(false)
const autoCleanSaveLoading = ref(false)
const autoCleanEnabled = ref(false)
const autoCleanConfig = reactive({
  lastRunTime: '',
  lastRunCount: 0,
})

onMounted(() => {
  latest();
  if (hasPerm('category:query')) {
    loadCategories()
  }
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const params = reactive({
  timeSort: 0,
  type: 'receive',
  categoryId: null,
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const clearParams = reactive(defaultClearParams())

function defaultClearParams() {
  return {
    subject: '',
    sendEmail: '',
    sendName: '',
    startTime: '',
    toEmail: '',
    endTime: '',
    type: 'eq',
  }
}

function resetClearParams() {
  Object.assign(clearParams, defaultClearParams())
}

function closedClear() {
  resetClearParams()
  clearTime.value = null
  if (!clearLoading.value) {
    clearProgress.value = ''
  }
}

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'account') return t('selectEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType
  params.categoryId = locaParams.categoryId || null
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

function openBathDelete() {
  showBathDelete.value = true
  loadAutoClean()
}

function buildClearParams() {
  const params = {...clearParams, startTime: '', endTime: ''}
  if (clearTime.value) {
    params.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    params.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  return params;
}

function hasClearCondition(params) {
  return Boolean(params.sendEmail || params.sendName || params.subject || params.toEmail || (params.startTime && params.endTime))
}

const CLEAR_BATCH_SIZE = 500

async function runBatchDelete(params) {
  let total = 0
  let totalMatched = null

  while (true) {
    const data = await allEmailBatchDelete({
      ...params,
      size: CLEAR_BATCH_SIZE,
      withTotal: totalMatched == null ? 1 : 0
    })
    const processed = Number(data.processed ?? data.total ?? 0)
    if (totalMatched == null) {
      totalMatched = Number(data.totalMatched ?? processed)
    }
    total += processed
    if (totalMatched > 0) {
      clearProgress.value = t('clearProgressWithTotal', {
        count: total,
        total: totalMatched,
        percent: Math.min(100, Math.floor((total / totalMatched) * 100))
      })
    } else {
      clearProgress.value = t('clearProgress', {count: total})
    }

    if (data.finished !== false || processed === 0) {
      return total
    }

    await sleep(80)
  }
}

function batchDelete() {

  const params = buildClearParams();
  if (!hasClearCondition(params)) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true
    clearProgress.value = t('clearProgress', {count: 0})

    runBatchDelete(params).then((total) => {
      ElMessage({
        message: t('clearSuccessWithCount', {count: total}),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
      clearProgress.value = ''
    })
  })
}

function applyAutoCleanConfig(config = {}) {
  autoCleanEnabled.value = Boolean(config.enabled)
  autoCleanConfig.lastRunTime = config.lastRunTime || ''
  autoCleanConfig.lastRunCount = config.lastRunCount || 0
  Object.assign(clearParams, defaultClearParams(), config.params || {})

  if (clearParams.startTime && clearParams.endTime) {
    clearTime.value = [
      tzDayjs(clearParams.startTime).toDate(),
      tzDayjs(clearParams.endTime).subtract(1, 'day').toDate()
    ]
  } else {
    clearTime.value = null
  }
}

function loadAutoClean() {
  autoCleanLoading.value = true
  allEmailAutoClean().then(applyAutoCleanConfig).finally(() => {
    autoCleanLoading.value = false
  })
}

function saveAutoClean() {
  const params = buildClearParams();

  if (autoCleanEnabled.value && !hasClearCondition(params)) {
    ElMessage({
      message: t('scheduledCleanupConditionRequired'),
      type: 'warning',
      plain: true
    })
    return
  }

  autoCleanSaveLoading.value = true
  allEmailAutoCleanSet({
    enabled: autoCleanEnabled.value,
    params
  }).then((config) => {
    applyAutoCleanConfig(config)
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    })
  }).finally(() => {
    autoCleanSaveLoading.value = false
  })
}

function rightSearch(type, value) {
  params.searchType = type;
  searchValue.value = value;
  search();
}

function refreshBefore() {
  searchValue.value = null
  params.timeSort = 0
  params.type = 'receive'
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null
  params.categoryId = null
  params.searchType = 'name'
}

function search() {

  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') {
    params.userEmail = searchValue.value
  }

  if (params.searchType === 'account') {
    params.accountEmail = searchValue.value
  }

  if (params.searchType === 'name') {
    params.name = searchValue.value
  }

  if (params.searchType === 'subject') {
    params.subject = searchValue.value
  }

  sysEmailScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function typeSelectChange() {
  search()
}

function categorySelectChange() {
  search()
}

function loadCategories() {
  categoryListReq().then(list => {
    categories.value = list.filter(item => Number(item.enabled) === 1)
    if (params.categoryId && params.categoryId !== 'uncategorized' && !categories.value.some(item => item.categoryId === params.categoryId)) {
      params.categoryId = null
      sysEmailScroll.value?.refreshList?.()
    }
  })
}

function handleCategorySearch(category) {
  if (!hasPerm('category:query')) return;
  params.categoryId = category.categoryId
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = Number(email.type) === EmailTypeEnum.RECEIVE
  emailStore.contentData.showForward = false
  emailStore.contentData.showUnread = false
  router.push({name: 'content'})
}


function getEmailList(emailId, size) {
  return allEmailList({emailId, size, ...params})
}

async function latest() {

  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (params.type !== 'receive') {
      continue
    }

    try {

      const curParams = JSON.stringify(params)
      let list = await allEmailLatest(latestId, {...params})

      if (list.length === 0) {
        continue
      }

      if (params.type !== 'receive') {
        continue
      }

      // 确保回来之后条件没变
      if (JSON.stringify(params) !== curParams) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


.search {
  padding-top: 5px;
  padding-bottom: 5px;
}

.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

.search-type {
  display: flex;
  color: var(--el-text-color-regular);
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.search-input {
  width: 100%;
  max-width: 280px;
  height: 28px;

  .setting-icon {
    position: relative;
    top: 3px;
  }
}

.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;

  :deep(.el-date-editor) {
    width: 100%;
  }

  :deep(.el-divider) {
    margin: 2px 0;
  }
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button {
    width: 100%;
  }
}

.auto-clean-switch {
  display: flex;
  align-items: center;
}

.auto-clean-desc {
  color: var(--secondary-text-color);
  font-size: 12px;
  line-height: 1.5;
}

.status-select {
  margin-bottom: 2px;
  width: 102px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.category-select {
  margin-bottom: 2px;
  width: 128px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.input-with-select {
  max-width: 200px;
  border-radius: 0 4px 4px 0;
}

:deep(.input-with-select .el-input-group__append) {
  background-color: var(--el-fill-color-blank);
}

:deep(.el-select__wrapper) {
  padding: 2px 10px;
  min-height: 28px;
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

.icon {
  cursor: pointer;
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
