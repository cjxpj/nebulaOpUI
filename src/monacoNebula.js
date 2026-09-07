/**
 * 词库 Monaco 编辑器共享配置（从 DicDebug.vue 抽出）
 * 注册 nebula 语言高亮、主题、补全、虚影补全；DicDebug 与 QQ 沙箱测试共用。
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js'
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
import 'monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'
import { ref } from 'vue'
import { apiPost } from '@/api.js'
// 词库语法高亮自定义配色（JSON 配置）
import dicHighlight from '@/dicHighlight.json'

export { monaco, dicHighlight }

/* ================= Monaco Worker 配置 ================= */
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

/* ================= 注册词库语言高亮 ================= */
monaco.languages.register({ id: 'nebula' })
// 注释语法配置：Ctrl+/ 行注释（多行每行加 //）
monaco.languages.setLanguageConfiguration('nebula', {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
})
// 构建 Monarch 分词器：root 顶部追加自定义正则（优先），其后为内置 tokens 规则
function buildNebulaTokenizer(customRules, tokens) {
  const customRoot = (customRules || []).map((r) => [new RegExp(r.regex), r.token])
  const pairs = ((tokens && tokens.pairs) || []).map((p, i) => ({ state: `pair${i}`, ...p }))
  const simpleRules = ((tokens && tokens.rules) || []).map((r) => [new RegExp(r.regex), r.token])

  const tokenizer = {
    root: [
      ...customRoot,
      ...pairs.map((p) => [new RegExp(p.open), p.token, `@${p.state}`]),
      ...simpleRules,
    ],
  }
  for (const p of pairs) {
    tokenizer[p.state] = [
      [new RegExp(p.close), p.token, '@pop'],
      ...p.content.map((c) => [new RegExp(c), p.token]),
    ]
  }
  return { defaultToken: '', tokenizer }
}

/* ================= 自定义语法高亮主题（JSON 配置） ================= */
export const HIGHLIGHT_CONFIG_KEY = 'nebula_dic_highlight_config'
const HEX_COLOR_RE = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/

// 校验并规范化 token 识别规则（正则）
function normalizeTokens(tokens) {
  const src = (tokens && typeof tokens === 'object' ? tokens : dicHighlight['分词规则']) || {}
  const rules = (Array.isArray(src['规则']) ? src['规则'] : []).map((r, i) => {
    if (!r || typeof r !== 'object' || typeof r['正则'] !== 'string' || !r['正则'] || typeof r['标记'] !== 'string' || !r['标记']) {
      throw new Error(`分词规则.规则[${i}] 需包含 正则 与 标记`)
    }
    try { new RegExp(r['正则']) } catch (e) { throw new Error(`分词规则.规则[${i}].正则 无效: ${e.message}`) }
    return { regex: r['正则'], token: r['标记'] }
  })
  const pairs = (Array.isArray(src['配对']) ? src['配对'] : []).map((p, i) => {
    if (!p || typeof p !== 'object' || typeof p['开始'] !== 'string' || !p['开始'] || typeof p['结束'] !== 'string' || !p['结束'] || typeof p['标记'] !== 'string' || !p['标记']) {
      throw new Error(`分词规则.配对[${i}] 需包含 开始、结束、标记`)
    }
    try { new RegExp(p['开始']) } catch (e) { throw new Error(`分词规则.配对[${i}].开始 无效: ${e.message}`) }
    try { new RegExp(p['结束']) } catch (e) { throw new Error(`分词规则.配对[${i}].结束 无效: ${e.message}`) }
    const content = (Array.isArray(p['内容']) ? p['内容'] : (typeof p['内容'] === 'string' && p['内容'] ? [p['内容']] : []))
      .map((c) => {
        if (typeof c !== 'string' || !c) throw new Error(`分词规则.配对[${i}].内容 必须是非空字符串`)
        try { new RegExp(c) } catch (e) { throw new Error(`分词规则.配对[${i}].内容 无效: ${e.message}`) }
        return c
      })
    if (!content.length) throw new Error(`分词规则.配对[${i}].内容 不能为空`)
    return { open: p['开始'], close: p['结束'], content, token: p['标记'] }
  })
  return { rules, pairs }
}

// 校验并补齐高亮配置，保证 defineTheme 所需字段齐全（颜色缺失会触发运行时异常）
// 说明：中文键只存在于配置 JSON 层，normalize 后统一转回 Monaco 所需的英文键（base/inherit/rules/colors/token/foreground）
export function normalizeHighlightConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || !cfg['暗色主题'] || !cfg['亮色主题']) {
    throw new Error('配置必须包含 暗色主题 与 亮色主题 两个主题')
  }
  const normalizeTheme = (t, fallbackBase) => ({
    base: ['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(t?.['基础主题']) ? t['基础主题'] : fallbackBase,
    inherit: t['继承默认'] !== false,
    rules: Array.isArray(t['规则']) ? t['规则'].map((r) => ({ token: r['标记'], foreground: r['前景色'] })) : [],
    colors: t['颜色'] && typeof t['颜色'] === 'object' ? t['颜色'] : {},
  })
  const rawCustom = Array.isArray(cfg['自定义规则']) ? cfg['自定义规则'] : []
  const customRules = rawCustom.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`自定义规则[${i}] 必须是对象`)
    if (typeof r['正则'] !== 'string' || !r['正则']) throw new Error(`自定义规则[${i}].正则 不能为空`)
    if (typeof r['颜色'] !== 'string' || !HEX_COLOR_RE.test(r['颜色'])) {
      throw new Error(`自定义规则[${i}].颜色 必须是 6 位十六进制色值（如 #FF5500）`)
    }
    try {
      new RegExp(r['正则'])
    } catch (e) {
      throw new Error(`自定义规则[${i}].正则 无效: ${e.message}`)
    }
    return { token: `custom.${i}`, regex: r['正则'], color: r['颜色'] }
  })
  return {
    dark: normalizeTheme(cfg['暗色主题'], 'vs-dark'),
    light: normalizeTheme(cfg['亮色主题'], 'vs'),
    tokens: normalizeTokens(cfg['分词规则'] ?? dicHighlight['分词规则']),
    customRules,
  }
}

export function applyHighlightConfig(cfg) {
  const customColors = (cfg.customRules || []).map((r) => ({ token: r.token, foreground: r.color }))
  monaco.editor.defineTheme('nebula-dark', { ...cfg.dark, rules: [...cfg.dark.rules, ...customColors] })
  monaco.editor.defineTheme('nebula-light', { ...cfg.light, rules: [...cfg.light.rules, ...customColors] })
  monaco.languages.setMonarchTokensProvider('nebula', buildNebulaTokenizer(cfg.customRules || [], cfg.tokens))
}

// 读取已保存的原始高亮配置（用于弹窗展示），未保存则回退默认 JSON
export function loadRawHighlightConfig() {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    /* 忽略非法存储 */
  }
  return dicHighlight
}

// 读取并规范化高亮配置，失败时回退默认
export function loadHighlightConfig() {
  try {
    return normalizeHighlightConfig(loadRawHighlightConfig())
  } catch (e) {
    return normalizeHighlightConfig(dicHighlight)
  }
}

// 初始化高亮主题与分词器
try {
  applyHighlightConfig(loadHighlightConfig())
} catch (e) {
  applyHighlightConfig(normalizeHighlightConfig(dicHighlight))
}

/* ================= 代码补全（命令/变量/关键字） ================= */
// 无子命令的词库命令（来源：dic/funcs/registry.go 与 bot 动态注入）
const DIC_CMDS_FLAT = [
  // 字符串
  '文本长度', '长度', '复读', '去除左右', '去除左', '去除右', '字符拼接', '查找字',
  '取中间', '截取', '替换', '分割', '字符切片', '大写字母', '小写字母', '中文转拼音', '炫酷文字',
  // 数字
  '数字格式化', '数字转中文', '四舍五入', '计算',
  // 科学计算
  '正弦', 'sin', '余弦', 'cos', '正切', 'tan', '反正弦', 'asin', '反余弦', 'acos',
  '反正切', 'atan', '反正切2', 'atan2', '幂运算', 'pow', '指数', 'exp', '自然对数', 'log', 'ln',
  '常用对数', 'log10', '二进制对数', 'log2', '平方根', 'sqrt', '立方根', 'cbrt',
  '绝对值', 'abs', '向上取整', 'ceil', '向下取整', 'floor',
  // 角度单位转换
  '角度转弧度', 'deg2rad', '弧度转角度', 'rad2deg', '百分度转弧度', 'gon2rad',
  '弧度转百分度', 'rad2gon', '密位转弧度', 'mil2rad', '弧度转密位', 'rad2mil',
  // 角度制三角函数
  '正弦度', 'SinDeg', '余弦度', 'CosDeg', '正切度', 'TanDeg',
  '正弦百分度', 'SinGon', '余弦百分度', 'CosGon', '正切百分度', 'TanGon',
  '正弦密位', 'SinMil', '余弦密位', 'CosMil', '正切密位', 'TanMil',
  // 统计
  '求和', 'sum', '计数', 'count', '平均值', 'mean', '中位数', 'median', '方差', 'variance', '标准差', 'stddev',
  // 金融
  '净现值', 'NPV', '内部收益率', 'IRR',
  // 复数
  '复数加', '复数减', '复数乘', '复数除', '复数模', '复数共轭',
  // 矩阵
  '矩阵加', '矩阵减', '矩阵乘', '矩阵转置', '矩阵行列式', '矩阵逆',
  // 随机
  '设置随机种子', '随机种子', 'seed', '随机小数', 'randfloat', '正态分布', 'normal', '指数分布', 'expdist',
  '随机文本', '随机数', '随机大小字母', '随机大写字母', '随机小写字母',
  '随机大小字母数字', '随机小写字母数字', '随机大写字母数字', '随机数字',
  // 变量
  '线程变量', '临时写', '临时读', '变量', '存在变量', '全局变量', '锁变量', '变量文本', '创建字典',
  // 流程控制
  '判断', '判断值', '判断空值', '延迟', '捕获输出', '拦截输出', 'STOP', '重启', 'GC回收', '跳行',
  // 定时任务
  '添加定时任务', '删除定时任务', '定时任务列表',
  // 文件操作
  '读', '写', '写文件', '读文件', '读文件_随机一行', '读文件_行数', '读文件行', '读文件MD5', '文件后缀', '存在文件', '存在文件夹',
  '存在文件或文件夹', '删除文件', '删除文件夹', '文件夹列表', '文件列表', '随机文件名',
  '随机文件夹名', '文件夹大小', '文件大小', '重命名', '复制粘贴', '下载文件', '设置工作目录', '文件属性', '设置文件属性',
  // 日志
  '日志', '打印',
  // 编码/解码
  '编码', '解码', 'MD5编码', 'B64编码', 'B64解码', 'URL编码', 'URL解码', 'URL链接编码',
  'URL链接解码', 'sha256', 'Byte生成', 'Byte转String', 'MD转义', 'MIME类型', '加密词库',
  // 正则
  '分割匹配', '正则替换', '正则匹配', '正则',
  // 加密/解密
  '哈基米加密', '哈基米解密',
  'AES_CBC加密', 'AES_CBC解密', 'AES_CFB加密', 'AES_CFB解密', 'AES_GCM加密', 'AES_GCM解密', 'AES_CTR加密', 'AES_CTR解密',
  // RSA
  'RSA生成密钥', 'RSA加密', 'RSA解密',
  // Ed25519
  'Ed25519种子大小', 'Ed25519生成密钥', 'Ed25519从种子生成密钥', 'Ed25519签名',
  'Ed25519验证签名', 'Ed25519公钥转换为Curve25519', 'Ed25519私钥转换为Curve25519',
  'Ed25519从Curve25519生成密钥',
  // 网络访问
  '新建访问', '访问', '访问POST', '访问转发',
  // 终端
  '创建终端', '创建Shell终端', 'MC终端颜色',
  // 数据库
  '新建mysql', '打开sqlite', '读sqlite', '写sqlite', '关闭数据库',
  'db_写', 'db_读', 'db_删除', 'db_删除文件', 'db_删除文件夹',
  'db_添加', 'db_减少', 'db_设置', 'db_查询', 'db_查询排名', 'db_清空经济系统',
  // JSON
  'JSON解析', 'json解析', 'JSON判断', 'JSON存', 'JSON存字', 'JSON追加', 'JSON追加字',
  'JSON删', 'JSON存在', 'JSON长度', 'JSON全部键', 'JSON美化', 'JSON重名解析',
  'JSON查找文本', 'JSON模糊查找文本', 'JSON正则查找文本', 'JSON拆分',
  // HTML / Markdown
  'HTML解析', 'HTML文本', 'HTML编码', 'HTML解码', 'MD转HTML',
  // 画布绘图
  '绘图', '创建画布', '获取画笔颜色', '写图片', '读图片',
  // 其他
  '读配置', '写配置', '云工具状态', 'GIF拆帧', '图片相似度', '图片最多颜色', '图片平均颜色', '排序', '范围', 'ZIP压缩', 'ZIP解压',
  '创建邮件', '主机', '时间戳转时间', '时间转时间戳', '时间间隔', '腾讯接口', '取前字符', '取后字符',
  // bot 动态注入
  '获取账号', '搜索账号', '群单发', '群发', '群单发图', '群单发MD', '群单发语音',
  '群单发视频', '私聊', '私聊图', '私聊MD', '发送文本', '发送MD', '发送视频', '发送语音', 'IMG', '调用',
  // 词库执行 / WebSocket（dic/registry.go）
  '执行词库', '执行词库文件', '回调', '重定向触发词', '执行PHP网页词库', '执行PHP网页词库文件',
  '执行网页词库', '执行网页词库文件', 'WS连接', 'WS断开', 'WS发送', '创建WS', '创建服务器', '编译词库', '核心服务器', '设置Ngrok', '读词库', '写词库',
  '终端_监听执行',
]

// 无参数命令（插入时不带参数占位）
const DIC_NO_ARG_CMDS = new Set([
  'STOP', '重启', 'GC回收', '捕获输出', '拦截输出', 'Ed25519种子大小', 'Ed25519生成密钥',
  '定时任务列表', '云工具状态', '核心服务器',
])

// 对象方法映射：创建函数 -> 方法列表（$变量.方法$，来自各 Class 实例的 Fn）
// 供输入 $变量. 后按变量类型精确补全
const DIC_CLASS_METHODS = {
  '创建WS': ['设置跨域', '设置词库路径', '设置访问路径', '设置变量'],
  '创建服务器': ['启动', '设置路由词库', '设置变量', '设置跨域', '设置核心服务器', '设置BeerFrp', '关闭'],
  '新建访问': ['切换GET', '切换POST', '切换PUT', '切换DELETE', '切换PATCH', '切换HEAD', '切换OPTIONS', '禁用跳转', '启用跳转', '设置头部', '设置超时', 'POST', 'POST文件', '发送', '全部内容', '内容'],
  '创建终端': ['异步执行', '执行目录', '执行', '解码器', '变量', '断开', '输入'],
  '创建Shell终端': ['异步执行', '执行目录', '执行', '解码器', '变量', '断开', '输入'],
  '新建mysql': ['PING', '执行', '切换数据库', '写', '读', '删除文件', '删除文件夹', '关闭'],
  '打开sqlite': ['写', '读', '执行', '删除文件', '删除文件夹', '关闭'],
  '创建邮件': ['发送', '发送HTML'],
  '腾讯接口': ['调用'],
  '创建字典': ['设置', '获取'],
  '创建画布': ['获取', '旋转', '圆角', '灰度', '全图马赛克', '字体', '大小', '设置颜色', '文本', '点', '线', '喷漆', '波浪', '油漆桶', '方形', '方形描边', '椭圆', '椭圆描边', '圆形', '圆形描边', '多边形', '多边形描边', '图片', '圆弧', '随机点', '随机线条', '高斯模糊', '马赛克'],
  '下载文件': ['进度', '速度', '已下载', '总大小', '状态', '错误'],
}

// 全部对象方法（去重，用于无法推断变量类型时的回退补全）
const DIC_CLASS_ALL_METHODS = [...new Set(Object.values(DIC_CLASS_METHODS).flat())]

// 无参数对象方法（插入时不带参数占位）
const DIC_CLASS_NO_ARG_METHODS = new Set([
  '切换GET', '切换HEAD', '切换OPTIONS', '禁用跳转', '启用跳转', '全部内容', '内容',
  '异步执行', '断开', 'PING', '关闭', '灰度', '启动', '设置核心服务器',
  '进度', '速度', '已下载', '总大小', '状态', '错误',
])

// 内置变量（来源：dto/value.go 的 Text 内置值）
const DIC_BUILTIN_VARS = [
  ['时间', '当前时间'],
  ['时间戳', '秒级时间戳'],
  ['毫秒时间戳', '毫秒级时间戳'],
  ['微秒时间戳', '微秒级时间戳'],
  ['纳秒时间戳', '纳秒级时间戳'],
  ['空格', '一个空格'],
  ['换行', '换行符'],
  ['系统', '操作系统类型'],
  ['版本', '程序版本'],
  ['触发词', '当前触发词'],
  ['触发', '匹配到的触发内容'],
  ['行数', '当前执行语句的行号（从 1 起）'],
  ['括号0', '整个消息（正则整组匹配）'],
  ['参数0', '整个消息（空格分割第 0 段）'],
  ['URL编码@变量', '对变量做 URL 编码', 'URL编码@${1:变量}%', 'URL编码'],
  ['B64编码@变量', '对变量做 Base64 编码', 'B64编码@${1:变量}%', 'B64编码'],
  ['URL@变量', '对变量做 URL 解码', 'URL@${1:变量}%', 'URL'],
  ['B64@变量', '对变量做 Base64 解码', 'B64@${1:变量}%', 'B64'],
  ['TYPE@变量', '获取变量类型', 'TYPE@${1:变量}%', 'TYPE'],
  ['!变量', '布尔/数值取反', '!${1:变量}%', '!'],
  ['时间yyyy-MM-dd', '格式化当前时间', '时间${1:yyyy-MM-dd HH:mm:ss}%', '时间'],
  ['随机数1-100', '区间随机数', '随机数${1:1}-${2:100}%', '随机数'],
]
const DIC_BUILTIN_VAR_SET = new Set(DIC_BUILTIN_VARS.map((v) => v[0]))

// 段/关键字（第 4 项为触发类别：# 段标记、[ 前缀标记、manual 仅手动补全时显示）
const DIC_KEYWORDS = [
  ['#私聊#', '私聊段前缀（仅私聊消息触发）', '#私聊#', '#'],
  ['[F]', '函数式触发（插件可调用）', '[F]', '['],
  ['[L]', '内部触发', '[L]', '['],
  ['[函数]', '函数声明', '[函数]', '['],
  ['[类]', '类声明', '[类]', '['],
  ['±图片地址±', '发送图片', '±${1:图片地址}±', 'manual'],
  ['"""多行文本"""', '多行文本内容', '"""\n${1:内容}\n"""', 'manual'],
]

// 流程控制（> 前缀，对应 entry.go 中 >跳过 / >终止 等解析分支）
const DIC_FLOW_ITEMS = [
  ['>否则', '如果块：否则分支'],
  ['>否则如果:条件', '如果块：否则如果分支', '>否则如果:${1:条件}'],
  ['如果是:值', '匹配框：case 分支', '如果是:${1:值}'],
  ['如果不是', '匹配框：默认分支'],
  ['>跳过', '跳过当前循环/分支'],
  ['>终止', '终止整个词库执行'],
  ['>终止 消息', '终止并输出消息', '>终止 ${1:消息}'],
  ['>终止循环', '跳出循环>块'],
  ['>终止遍历', '跳出遍历>块'],
]

// 框声明（> 结尾，对应 entry.go 中 JSON>/文本>/纯文本>/变量:函数>/变量:执行函数>/#:执行函数>/如果>/遍历>/循环> 等框解析分支）
const DIC_BOX_ITEMS = [
  ['JSON>', 'JSON 框声明', 'JSON>${1:内容}'],
  ['文本>', '文本框声明', '文本>${1:内容}'],
  ['纯文本>', '纯文本框声明（不解析变量）', '纯文本>${1:内容}'],
  ['函数>', '函数框声明（存入变量）', '${1:变量}:函数>${2:默认参数}'],
  ['执行函数>', '函数框立即执行（返回内容写入变量）', '${1:变量}:执行函数>'],
  ['#:执行函数>', '函数框异步执行（后台 goroutine）', '#:执行函数>'],
  ['如果>', '如果框声明', '如果>${1:条件}'],
  ['匹配>', '匹配框声明（switch）', '匹配>${1:表达式}'],
  ['遍历>', '遍历框声明', '遍历>${1:变量}'],
  ['循环>', '循环框声明', '循环>${1:变量}'],
]

// 构造补全项
// noArg：是否无参数命令（省略则回退到本地硬编码 DIC_NO_ARG_CMDS 判断）
function cmdItem(name, noArg) {
  const isNoArg = noArg !== undefined ? noArg : DIC_NO_ARG_CMDS.has(name)
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: '词库命令',
    sortText: 'a' + name,
    // 闭合的 $ 直接字面输出（snippet 中结尾裸 $ 视为字面符号，避免 $$ 转义产生多余 $）
    insertText: isNoArg ? name + '$' : name + ' ${1:参数}$',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  }
}

// 对象方法补全项（$变量.方法$）
function methodItem(name) {
  const isNoArg = DIC_CLASS_NO_ARG_METHODS.has(name)
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Method,
    detail: '对象方法',
    sortText: 'a' + name,
    insertText: isNoArg ? name + '$' : name + ' ${1:参数}$',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  }
}

function varItem(name, detail, snippet, filterText) {
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Variable,
    detail: detail || '词库变量',
    sortText: 'b' + name,
    // filterText 决定 Monaco 的过滤匹配词（如 label「时间yyyy-MM-dd」按「时间」匹配）
    filterText: filterText || name,
    insertText: snippet || name + '%',
    insertTextRules: snippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  }
}

function kwItem(name, detail, insert) {
  // 含 $ 占位符的项需作为 snippet 插入，否则 ${...} 会原样输出
  const isSnippet = !!insert && insert.includes('$')
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: detail || '词库关键字',
    sortText: 'c' + name,
    insertText: insert || name,
    insertTextRules: isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  }
}

// 注入的全局变量（各页面调用 setInjectedGVars 同步，每项 key=value，# 开头为注释）
let injectedGVarList = []

// 页面同步已注入的全局变量键名列表（词库调试页为运行配置的 g 列表）
export function setInjectedGVars(list) {
  injectedGVarList = Array.isArray(list) ? list : []
}

function injectedGVars() {
  const names = []
  for (const item of injectedGVarList) {
    const t = String(item).trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx > 0) names.push(t.slice(0, idx).trim())
  }
  return names
}

// 扫描当前词库内容中出现的 %变量%
function scanDicVars(text) {
  const set = new Set()
  const re = /%([^%\n]+)%/g
  let m
  while ((m = re.exec(text))) {
    const v = m[1].trim()
    if (v) set.add(v)
  }
  return set
}

// 判断光标前的触发字符（$ 命令、% 变量、# 段、[ 前缀、> 流程/框）
function detectTrigger(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === '$') return 'cmd'
    if (ch === '%') return 'var'
    if (ch === '#') return 'kw'
    if (ch === '[') return 'prefix'
    if (ch === '>') return 'flow'
    // 遇到空格/制表符说明进入参数区，不再向前匹配
    if (ch === ' ' || ch === '\t') break
  }
  return 'all'
}

// 判断光标前是否为 $变量. 形式（对象方法调用），是则返回变量名，否则返回 null
function detectClassMethodTrigger(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  const m = before.match(/\$([^\s$%#\[.]+)\.$/)
  return m ? m[1] : null
}

// 扫描全文，推断「变量 -> 创建函数」映射（识别 变量:...$创建函数 形式）
function buildClassVarMap(model) {
  const map = new Map()
  const text = model.getValue()
  const re = /([A-Za-z0-9_\u4e00-\u9fa5]+)\s*:\s*\$([^\s$%]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (DIC_CLASS_METHODS[m[2]]) {
      map.set(m[1], m[2])
    }
  }
  return map
}

// 计算补全的替换范围：仅 [ 前缀与 # 段这类「插入文本以触发字符开头」的补全，
// 需要覆盖从触发字符到光标的全部内容（含其后跟随的字符，如已输入的 [F），
// 否则已输入的触发字符会残留，出现 [[F]、##私聊# 的重复符号
function getReplaceRange(model, position, trigger) {
  if (trigger !== 'prefix' && trigger !== 'kw') return undefined
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  const ch = trigger === 'prefix' ? '[' : '#'
  let start = -1
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ch) {
      start = i
      break
    }
    // 触发字符与光标之间的其它字符（如 [F）一并覆盖；遇到空白停止
    if (before[i] === ' ' || before[i] === '\t') break
  }
  if (start < 0) return undefined
  return new monaco.Range(position.lineNumber, start + 1, position.lineNumber, position.column)
}

// 计算 > 触发补全的替换范围：覆盖从本 token 起点到光标。
// > 既作前缀（流程控制 >终止）也作后缀（框声明 JSON>），统一替换整个 token
// 可避免补全后残留重复的 > 或框关键字（如 >>终止、JSONJSON>）。
function getFlowReplaceRange(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  let tokenStart = 0
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ' ' || before[i] === '\t') {
      tokenStart = i + 1
      break
    }
  }
  return new monaco.Range(position.lineNumber, tokenStart + 1, position.lineNumber, position.column)
}

// 从后端实时拉取的已注册函数列表；加载成功则优先使用，失败时回退到上面的硬编码列表
export const dicFuncs = ref([])

export async function loadDicFuncs() {
  try {
    const data = await apiPost({ type: 'get_dic_funcs' })
    if (data && Array.isArray(data.cmds)) {
      dicFuncs.value = data.cmds
    }
  } catch (e) {
    console.warn('读取词库函数列表失败，回退本地补全:', e)
  }
}

// 注册词库补全：$ 命令、% 变量、# 段标记、[ 前缀标记、. 对象方法、> 流程/框
monaco.languages.registerCompletionItemProvider('nebula', {
  triggerCharacters: ['$', '%', '#', '[', '.', '>'],
  provideCompletionItems(model, position, context) {
    const triggerChar = context?.triggerCharacter
    // 对象方法调用：$变量. 后按变量类型精确补全方法
    const classVarName = detectClassMethodTrigger(model, position)
    if (classVarName !== null) {
      const classVarMap = buildClassVarMap(model)
      const createFn = classVarMap.get(classVarName)
      const methods = createFn ? DIC_CLASS_METHODS[createFn] || DIC_CLASS_ALL_METHODS : DIC_CLASS_ALL_METHODS
      return { suggestions: methods.map(methodItem) }
    }
    // 其它位置的 . 不触发补全
    if (triggerChar === '.') {
      return { suggestions: [] }
    }
    const isTriggerChar =
      context?.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
    // 字符触发时按触发类型过滤候选；非触发字符时显示全部
    const trigger = isTriggerChar ? detectTrigger(model, position) : 'all'
    // 替换范围：仅 [ 前缀、# 段触发时需要覆盖已输入的触发字符
    const insertRange = getReplaceRange(model, position, trigger)
    const flowRange = trigger === 'flow' ? getFlowReplaceRange(model, position) : undefined
    const text = model.getValue()
    const items = []

    const showCmd = trigger === 'all' || trigger === 'cmd'
    const showVar = trigger === 'all' || trigger === 'var'
    const showKw = trigger === 'all' || trigger === 'kw'
    const showPrefix = trigger === 'all' || trigger === 'prefix'
    const showFlow = trigger === 'all' || trigger === 'flow'

    // 命令
    if (showCmd) {
      const funcs = dicFuncs.value
      if (Array.isArray(funcs) && funcs.length) {
        // 后端实时列表：名称与无参标记均来自注册表
        for (const f of funcs) {
          if (f && f.name) items.push(cmdItem(f.name, !!f.no_arg))
        }
      } else {
        // 后端未加载成功时回退本地硬编码列表
        for (const name of DIC_CMDS_FLAT) {
          items.push(cmdItem(name))
        }
      }
    }

    // 段/前缀标记
    if (showKw || showPrefix) {
      for (const [name, detail, insert, cat] of DIC_KEYWORDS) {
        if (trigger === 'all') items.push(kwItem(name, detail, insert))
        else if (cat === '#' && showKw) items.push(kwItem(name, detail, insert))
        else if (cat === '[' && showPrefix) items.push(kwItem(name, detail, insert))
      }
    }

    // 流程控制与框声明（> 触发）
    if (showFlow) {
      for (const [name, detail, insert] of DIC_FLOW_ITEMS) {
        items.push(kwItem(name, detail, insert))
      }
      for (const [name, detail, insert] of DIC_BOX_ITEMS) {
        items.push(kwItem(name, detail, insert))
      }
    }

    // 变量
    if (showVar) {
      for (const [name, detail, snippet, filterText] of DIC_BUILTIN_VARS) {
        items.push(varItem(name, detail, snippet, filterText))
      }

      // 词库中已使用的变量（去重，内置变量不重复展示）
      const seen = new Set()
      for (const v of scanDicVars(text)) {
        if (!DIC_BUILTIN_VAR_SET.has(v) && !seen.has(v)) {
          seen.add(v)
          items.push(varItem(v, '词库中已使用'))
        }
      }

      // 已注入的全局变量
      for (const name of injectedGVars()) {
        if (!DIC_BUILTIN_VAR_SET.has(name) && !seen.has(name)) {
          seen.add(name)
          items.push(varItem(name, '已注入的全局变量'))
        }
      }
    }

    // 设置替换范围：覆盖已输入的触发字符与其后内容，避免补全后残留多余符号
    if (flowRange) {
      for (const item of items) item.range = flowRange
    } else if (insertRange) {
      for (const item of items) item.range = insertRange
    }

    return { suggestions: items }
  },
})

/* ================= 虚影文字补全（ghost text / inline suggest） ================= */
// 收集全部命令候选（后端实时列表优先，失败回退本地硬编码）
function collectCmdCandidates() {
  const funcs = dicFuncs.value
  if (Array.isArray(funcs) && funcs.length) {
    return funcs.map((f) => ({ name: f.name, noArg: !!f.no_arg }))
  }
  const out = []
  for (const name of DIC_CMDS_FLAT) out.push({ name, noArg: DIC_NO_ARG_CMDS.has(name) })
  return out
}

// 判断光标前的虚影补全上下文：触发类型 + 已输入前缀 + 触发字符下标
function detectInlineContext(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === '$') return { type: 'cmd', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '%') return { type: 'var', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '#') return { type: 'kw', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '[') return { type: 'prefix', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '>') return { type: 'flow', prefix: before.slice(i + 1), startIdx: i }
    // 遇到空格/制表符说明已进入参数区，不再提示
    if (ch === ' ' || ch === '\t') break
  }
  return null
}

// 前缀匹配变量名：内置变量 → 词库已使用 → 注入全局变量
function findVarName(prefix, text) {
  for (const v of DIC_BUILTIN_VARS) {
    const name = v[0]
    const ft = v[3] || name
    if (name.startsWith(prefix) || ft.startsWith(prefix)) return name
  }
  const seen = new Set()
  for (const name of scanDicVars(text)) {
    if (!DIC_BUILTIN_VAR_SET.has(name) && name.startsWith(prefix) && !seen.has(name)) {
      return name
    }
  }
  for (const name of injectedGVars()) {
    if (!DIC_BUILTIN_VAR_SET.has(name) && name.startsWith(prefix) && !seen.has(name)) {
      return name
    }
  }
  return null
}

// 前缀匹配段/前缀标记（# 段、[ 前缀），返回含触发字符的完整名
function findKeyword(prefix, type) {
  const cat = type === 'kw' ? '#' : '['
  for (const [name, , , c] of DIC_KEYWORDS) {
    if (c === cat && name.startsWith(cat + prefix)) return name
  }
  return null
}

// 前缀匹配流程控制关键字（> 前缀），返回含触发字符的完整名
function findFlow(prefix) {
  for (const [name] of DIC_FLOW_ITEMS) {
    if (name.startsWith('>' + prefix)) return name
  }
  return null
}

// 注册虚影文字补全：输入 $ % [ # > 后按前缀灰字提示，Tab 接受
monaco.languages.registerInlineCompletionsProvider('nebula', {
  provideInlineCompletions(model, position) {
    const ctx = detectInlineContext(model, position)
    // 需要至少输入一个前缀字符才提示，避免刚打触发符就弹首个候选
    if (!ctx || !ctx.prefix) return { items: [] }

    const prefix = ctx.prefix
    // 空 range：从光标处追加 ghost（只补全剩余部分，不覆盖已输入前缀）
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    )

    let insertText = ''
    if (ctx.type === 'cmd') {
      const hit = collectCmdCandidates().find((c) => c.name.startsWith(prefix))
      if (!hit) return { items: [] }
      // 无参命令补闭合 $，有参命令补命令名 + 空格（光标停在参数处继续输入）
      insertText = (hit.noArg ? hit.name + '$' : hit.name + ' ').slice(prefix.length)
    } else if (ctx.type === 'var') {
      const name = findVarName(prefix, model.getValue())
      if (!name) return { items: [] }
      insertText = (name + '%').slice(prefix.length)
    } else if (ctx.type === 'flow') {
      const name = findFlow(prefix)
      if (!name) return { items: [] }
      // name 含触发字符，去掉首个字符（>）和已输入前缀，得到剩余补全文本
      insertText = name.slice(1 + prefix.length)
    } else {
      const name = findKeyword(prefix, ctx.type)
      if (!name) return { items: [] }
      // name 含触发字符，去掉首个字符（# 或 [）和已输入前缀，得到剩余补全文本
      insertText = name.slice(1 + prefix.length)
    }

    return { items: [{ insertText, range }] }
  },
  // Monaco 0.5x 要求实现该生命周期方法（补全列表释放时回调），
  // 缺失会导致 ghost 装饰 dispose 中断、虚影残留
  freeInlineCompletions() {},
})
