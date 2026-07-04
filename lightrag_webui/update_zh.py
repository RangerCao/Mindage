import json, os

os.chdir(os.path.dirname(__file__) or '.')

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)

# Add comprehensive translations for visible UI text
translations = {
    "header": {
        "logout": "退出登录",
        "projectRepository": "项目仓库",
        "defaultWorkspace": "(默认)",
        "frontendNeedsRebuild": "前端需要重新构建",
        "documents": "文档",
        "knowledgeGraph": "知识图谱",
        "knowledgeBase": "知识库",
        "treeView": "树状视图",
        "retrieval": "检索",
        "api": "API",
        "freeLogin": "免费登录",
        "guestMode": "访客模式"
    },
    "login": {
        "title": "登录",
        "username": "用户名",
        "password": "密码",
        "loginButton": "登录",
        "loggingIn": "登录中...",
        "error": "登录失败",
        "guestMode": "访客模式",
        "apiKey": "API密钥",
        "apiKeyPlaceholder": "输入API密钥",
        "submit": "提交",
        "tokenExpired": "令牌已过期，请重新登录",
        "tokenRefreshed": "令牌已刷新",
        "welcome": "欢迎使用 LightRAG",
        "description": "基于知识图谱的检索增强生成系统"
    },
    "sidebar": {
        "groupChat": "智能助手",
        "chat": "对话",
        "groupKnowledge": "知识管理",
        "documents": "文档管理",
        "knowledgeBase": "知识库管理",
        "groupViews": "数据视图",
        "knowledgeGraph": "知识图谱",
        "treeView": "树状视图",
        "groupSystem": "系统",
        "retrieval": "检索查询",
        "api": "API接口",
        "collapse": "收起侧栏",
        "expand": "展开侧栏"
    },
    "chat": {
        "welcome": "你好！有什么可以帮助你的？",
        "welcomeDesc": "询问文档内容、搜索知识图谱或探索你的数据。",
        "inputPlaceholder": "输入你的问题...",
        "send": "发送",
        "stop": "停止",
        "clear": "清空对话"
    },
    "document": {
        "title": "文档管理",
        "upload": "上传",
        "uploadTitle": "上传文档",
        "scan": "扫描",
        "scanRetry": "扫描/重试",
        "clear": "清空",
        "pipeline": "流水线",
        "all": "全部",
        "completed": "已完成",
        "parsing": "解析中",
        "processing": "处理中",
        "failed": "失败",
        "file_name": "文件名",
        "id": "ID",
        "summary": "摘要",
        "status": "状态",
        "length": "长度",
        "chunks": "分块",
        "created": "创建时间",
        "updated": "更新时间",
        "noDocuments": "暂无文档",
        "noDocumentsDesc": "还没有上传任何文档。",
        "delete": "删除",
        "deleteTitle": "删除文档",
        "deleteConfirm": "确定要删除选中的文档吗？此操作不可恢复。",
        "deleteSuccess": "删除成功",
        "uploadSuccess": "上传成功",
        "scanSuccess": "扫描完成",
        "pipelineStatus": "流水线状态",
        "processingFiles": "处理文件中",
        "viewDetails": "查看详情",
        "reprocessFailed": "重新处理失败文档",
        "cancelPipeline": "取消流水线",
        "uploadDescription": "支持 PDF、TXT、Markdown 等格式",
        "dropFiles": "拖拽文件到此处",
        "selectFiles": "选择文件"
    },
    "knowledgeBase": {
        "title": "知识库管理",
        "description": "管理隔离的知识库，每个知识库拥有独立的文档和图谱数据",
        "create": "创建知识库",
        "createTitle": "新建知识库",
        "name": "名称",
        "namePlaceholder": "输入知识库名称",
        "delete": "删除",
        "deleteConfirm": "确定要删除知识库「{name}」吗？",
        "refresh": "刷新",
        "noBases": "暂无知识库",
        "noBasesDesc": "创建知识库来隔离不同的数据集。",
        "current": "当前知识库",
        "switch": "切换到",
        "switchSuccess": "切换成功",
        "createSuccess": "创建成功",
        "deleteSuccess": "删除成功",
        "usage": "使用情况"
    },
    "treeViewer": {
        "documents": "文档列表",
        "nodes": "个节点",
        "searchPlaceholder": "搜索节点...",
        "loading": "加载中...",
        "selectDoc": "选择一个文档查看其树状结构",
        "noDocuments": "暂无树索引文档",
        "noTrees": "暂无树索引",
        "noTreesDesc": "启用 ENABLE_PAGEINDEX=true 后，上传文档时将自动生成树状索引。",
        "noTreesHint": "启用后上传文档，等待处理完成即可查看树状结构。",
        "refresh": "刷新",
        "disabled": "树索引未启用",
        "disabledDesc": "在 .env 中设置 ENABLE_PAGEINDEX=true 并重启服务以启用树索引功能。"
    },
    "graph": {
        "title": "知识图谱",
        "search": "搜索节点",
        "searchPlaceholder": "输入节点名称...",
        "legend": "图例",
        "zoomIn": "放大",
        "zoomOut": "缩小",
        "reset": "重置",
        "fullscreen": "全屏",
        "properties": "属性",
        "noData": "暂无图谱数据",
        "labels": "标签",
        "layout": "布局",
        "maxDepth": "最大深度",
        "maxNodes": "最大节点数",
        "focus": "聚焦",
        "nodeCount": "个节点",
        "edgeCount": "条边"
    },
    "retrievePanel": {
        "title": "检索",
        "input": "输入查询...",
        "send": "发送",
        "clear": "清空",
        "stop": "停止",
        "mode": "模式",
        "naive": "基础",
        "local": "本地",
        "global": "全局",
        "hybrid": "混合",
        "mix": "综合",
        "bypass": "旁路",
        "settings": "检索设置",
        "topK": "Top-K",
        "chunkTopK": "分块Top-K",
        "responseType": "回复类型",
        "singleParagraph": "单段落",
        "multipleParagraphs": "多段落",
        "bulletPoints": "要点",
        "historyTurns": "历史轮次",
        "stream": "流式输出",
        "noHistory": "无历史记录",
        "clearHistory": "清空历史",
        "copy": "复制",
        "copied": "已复制",
        "error": "请求失败",
        "canceled": "已取消",
        "regenerate": "重新生成",
        "chatMessage": {
            "thinking": "思考中...",
            "thinkingTime": "思考用时 {time} 秒",
            "thinkingInProgress": "思考进行中...",
            "userTerminated": "用户已终止"
        }
    },
    "api": {
        "title": "API 文档",
        "endpoints": "接口列表",
        "description": "RESTful API 接口文档",
        "baseUrl": "基础URL"
    },
    "settings": {
        "title": "设置",
        "theme": "主题",
        "light": "浅色",
        "dark": "深色",
        "system": "跟随系统",
        "language": "语言",
        "healthCheck": "健康检查",
        "healthCheckInterval": "检查间隔",
        "apiKey": "API密钥",
        "apiKeyDesc": "设置API密钥用于认证"
    },
    "common": {
        "loading": "加载中...",
        "save": "保存",
        "cancel": "取消",
        "confirm": "确定",
        "close": "关闭",
        "edit": "编辑",
        "create": "新建",
        "delete": "删除",
        "search": "搜索",
        "refresh": "刷新",
        "retry": "重试",
        "back": "返回",
        "next": "下一步",
        "submit": "提交",
        "reset": "重置",
        "noData": "暂无数据",
        "error": "出错了",
        "success": "操作成功",
        "warning": "警告",
        "info": "提示",
        "copy": "复制",
        "copied": "已复制",
        "download": "下载",
        "upload": "上传",
        "export": "导出",
        "import": "导入"
    }
}

def deep_update(d, u):
    for k, v in u.items():
        if isinstance(v, dict):
            d[k] = deep_update(d.get(k, {}), v)
        else:
            d[k] = v
    return d

deep_update(zh, translations)

with open('src/locales/zh.json', 'w', encoding='utf-8') as f:
    json.dump(zh, f, ensure_ascii=False, indent=4)
    f.write('\n')

print('Updated zh.json with', sum(len(v) if isinstance(v, dict) else 1 for v in translations.values()), 'translations')
