<template>
  <div class="doc-viewer">
    <div v-if="loading" class="doc-loading">加载文档中...</div>
    <div v-else-if="error" class="doc-error">{{ error }}</div>
    <template v-else>
      <!-- 搜索栏 -->
      <div class="search-bar">
        <div class="search-row">
          <ElInput
            v-model="searchText"
            placeholder="搜索函数..."
            clearable
            :prefix-icon="Search"
            size="default"
            class="search-input"
            @input="onSearch"
            @keydown.enter="jumpToNext"
          >
            <template #suffix v-if="searchText && matchCount > 0">
              <span class="match-nav">
                <span class="match-idx">{{ currentMatchIdx + 1 }}/{{ matchCount }}</span>
                <ElButton link size="small" @mousedown.prevent @click="jumpToPrev">
                  <ElIcon><ArrowUp /></ElIcon>
                </ElButton>
                <ElButton link size="small" @mousedown.prevent @click="jumpToNext">
                  <ElIcon><ArrowDown /></ElIcon>
                </ElButton>
              </span>
            </template>
          </ElInput>
        </div>
        <!-- 搜索结果列表 -->
        <div v-if="searchText && matchCount > 0" class="search-results">
          <div
            v-for="(item, idx) in searchResults"
            :key="idx"
            class="search-result-item"
            :class="{ active: idx === currentMatchIdx }"
            @click="jumpTo(idx)"
          >
            <span class="result-num">{{ idx + 1 }}</span>
            <span class="result-text" v-html="item"></span>
          </div>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="doc-body">
        <div ref="contentRef" class="doc-content" v-html="displayHtml"></div>
        <aside class="toc-sidebar">
          <div class="toc-title">目录</div>
          <nav class="toc-nav">
            <a
              v-for="item in tocItems"
              :key="item.id"
              :class="['toc-item', 'toc-' + item.level]"
              :href="'#' + item.id"
              @click.prevent="scrollToHeading(item.id)"
            >
              {{ item.text }}
            </a>
          </nav>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { ElInput, ElButton, ElIcon } from 'element-plus'
import { Search, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { config } from '@/config.js'

const docHtml = ref('')
const loading = ref(true)
const error = ref('')
const searchText = ref('')
const matchCount = ref(0)
const currentMatchIdx = ref(0)
const contentRef = ref(null)
const searchResults = ref([])

/* ================= TOC 解析 ================= */
const tocItems = computed(() => {
  if (!docHtml.value) return []
  const items = []
  const regex = /<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi
  let match
  let idIdx = 0
  while ((match = regex.exec(docHtml.value)) !== null) {
    const level = match[1]
    const text = match[2].replace(/<[^>]+>/g, '')
    idIdx++
    items.push({
      id: 'toc-' + idIdx,
      level: 'h' + level,
      text,
    })
  }
  return items
})

function scrollToHeading(id) {
  const allHeadings = contentRef.value?.querySelectorAll?.('h1, h2, h3')
  const idx = parseInt(id.replace('toc-', '')) - 1
  if (allHeadings && allHeadings[idx]) {
    allHeadings[idx].scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/* ================= 搜索高亮 ================= */
const displayHtml = computed(() => {
  if (!docHtml.value) return ''
  if (!searchText.value || searchText.value.length < 2) {
    matchCount.value = 0
    searchResults.value = []
    currentMatchIdx.value = 0
    return docHtml.value
  }
  return highlightText(docHtml.value, searchText.value)
})

function highlightText(html, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let count = 0
  const results = []
  const regex = new RegExp(`(>)([^<]*?)(${escaped})([^<]*?)(<)`, 'gi')
  const result = html.replace(regex, (_, p1, p2, p3, p4, p5) => {
    const before = p2.slice(-30)
    const after = p4.slice(0, 30)
    results.push(`${before}<mark class="search-highlight">${p3}</mark>${after}`)
    count++
    return `${p1}${p2}<mark class="search-highlight" data-idx="${count - 1}">${p3}</mark>${p4}${p5}`
  })
  matchCount.value = count
  searchResults.value = results
  currentMatchIdx.value = 0
  return result
}

function onSearch() {
  if (searchText.value && matchCount.value > 0) {
    nextTick(() => jumpTo(0))
  }
}

function jumpTo(idx) {
  currentMatchIdx.value = idx
  nextTick(() => {
    const el = contentRef.value?.querySelector?.(`mark[data-idx="${idx}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

function jumpToNext() {
  if (matchCount.value === 0) return
  const next = (currentMatchIdx.value + 1) % matchCount.value
  jumpTo(next)
}

function jumpToPrev() {
  if (matchCount.value === 0) return
  const prev = (currentMatchIdx.value - 1 + matchCount.value) % matchCount.value
  jumpTo(prev)
}

/* ================= 加载文档 ================= */
async function fetchDoc() {
  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'get_dic_doc' }),
    })
    if (!res.ok) throw new Error('请求失败')
    const data = await res.json()
    docHtml.value = data.content
  } catch (e) {
    error.value = '加载文档失败: ' + e.message
  } finally {
    loading.value = false
  }
}

onMounted(fetchDoc)
</script>

<style scoped>
.doc-viewer {
  padding: 16px 24px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 搜索栏 ===== */
.search-bar {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.search-row {
  max-width: 500px;
}

.search-input {
  width: 100%;
}

.match-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.match-idx {
  font-size: 12px;
  color: #67c23a;
  margin-right: 4px;
}

/* ===== 搜索结果列表 ===== */
.search-results {
  max-width: 500px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 4px;
  margin-top: 4px;
  background: var(--el-bg-color, #fff);
}

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.5;
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
  transition: background 0.15s;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.search-result-item.active {
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.result-num {
  color: #909399;
  font-size: 11px;
  min-width: 20px;
  text-align: right;
  flex-shrink: 0;
}

.result-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-text :deep(mark) {
  background: #fff176;
  color: #333;
  padding: 0 1px;
  border-radius: 1px;
}

/* ===== 主体 ===== */
.doc-body {
  flex: 1;
  display: flex;
  gap: 24px;
  min-height: 0;
  overflow: hidden;
}

.doc-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
  padding-right: 8px;
}

.doc-content :deep(h1) { font-size: 22px; margin: 16px 0 8px; }
.doc-content :deep(h2) { font-size: 18px; margin: 14px 0 6px; }
.doc-content :deep(h3) { font-size: 15px; margin: 12px 0 4px; }
.doc-content :deep(p) { margin: 4px 0; }
.doc-content :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.doc-content :deep(pre) { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
.doc-content :deep(table) { border-collapse: collapse; margin: 8px 0; }
.doc-content :deep(th), .doc-content :deep(td) { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
.doc-content :deep(th) { background: #f5f5f5; }

/* ===== TOC 目录 ===== */
.toc-sidebar {
  width: 200px;
  flex-shrink: 0;
  overflow-y: auto;
  border-left: 1px solid var(--el-border-color-light, #e4e7ed);
  padding-left: 16px;
}

.toc-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}

.toc-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toc-item {
  display: block;
  font-size: 13px;
  color: #606266;
  text-decoration: none;
  padding: 3px 0;
  cursor: pointer;
  transition: color 0.15s;
  border-radius: 2px;
}

.toc-item:hover {
  color: var(--el-color-primary, #409eff);
}

.toc-h1 { font-weight: 600; }
.toc-h2 { padding-left: 12px; }
.toc-h3 { padding-left: 24px; font-size: 12px; }

.doc-loading {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}

.doc-error {
  color: #f56c6c;
  padding: 20px;
}
</style>

<style>
.dark .doc-content code { background: #2d2d2d; color: #e0e0e0; }
.dark .doc-content pre { background: #2d2d2d; color: #e0e0e0; }
.dark .doc-content th, .dark .doc-content td { border-color: #444; }
.dark .doc-content th { background: #333; }
.dark .doc-content h1,
.dark .doc-content h2,
.dark .doc-content h3,
.dark .doc-content h4,
.dark .doc-content h5,
.dark .doc-content h6,
.dark .doc-content p,
.dark .doc-content li,
.dark .doc-content td { color: #e0e0e0; }

.dark .toc-sidebar { border-color: #444; }
.dark .toc-title { color: #e0e0e0; }
.dark .toc-item { color: #bbb; }

mark.search-highlight {
  background: #fff176;
  color: #333;
  padding: 1px 2px;
  border-radius: 2px;
}

.dark mark.search-highlight {
  background: #f9a825;
  color: #111;
}
</style>
