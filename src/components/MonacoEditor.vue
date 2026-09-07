<script setup>
import { ref, onMounted, onBeforeUnmount, watch, inject } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
// 编辑器核心特性（contrib），不含内置语言与语言服务
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js'
import 'monaco-editor/esm/vs/editor/browser/coreCommands.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js'
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/links/browser/links.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
// 内置语言高亮（基础语言 + 语言服务）
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
// codicon 图标样式（折叠箭头、widget 图标等）
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'
// 各语言 Worker（EditorWorker + HTML/JSON/TS/CSS 语言服务，相对路径导入绕开 exports 限制）
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'
import JsonWorker from '../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker'
import CssWorker from '../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker'
import HtmlWorker from '../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker'
import TsWorker from '../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
})
const emit = defineEmits(['update:modelValue'])

const isDarkMode = inject('isDarkMode', ref(true))
const container = ref(null)
let editor = null
let suppress = false

onMounted(() => {
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    lineNumbers: 'on',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    wordWrap: 'off',
    theme: isDarkMode.value ? 'vs-dark' : 'vs',
  })
  editor.onDidChangeModelContent(() => {
    if (suppress) return
    emit('update:modelValue', editor.getValue())
  })
})

watch(
  () => props.modelValue,
  (val) => {
    if (editor && val !== editor.getValue()) {
      suppress = true
      editor.setValue(val)
      suppress = false
    }
  },
)

watch(isDarkMode, (dark) => {
  editor?.updateOptions({ theme: dark ? 'vs-dark' : 'vs' })
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div ref="container" class="monaco-editor-host"></div>
</template>

<style scoped>
.monaco-editor-host {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
