import json, os

os.chdir(os.path.dirname(__file__) or '.')

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)
with open('src/locales/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)

# Add ALL missing keys from en.json to zh.json (with Chinese translations where available)
translations = {
    "documentPanel": {
        "documentManager": {
            "title": "文档管理",
            "scanTooltip": "扫描新文档目录",
            "scanButton": "扫描/重试",
            "pipelineStatusTooltip": "查看流水线状态",
            "clearTooltip": "清空所有文档",
            "uploadTooltip": "上传文档",
            "fileNameToggle": "文件名",
            "status": {
                "completed": "已完成",
                "preprocessed": "预处理",
                "parsing": "解析中",
                "analyzing": "分析中",
                "processing": "处理中",
                "pending": "待处理",
                "failed": "失败",
            },
            "errors": {
                "loadFailed": "加载失败: {error}",
                "scanFailed": "扫描失败: {error}",
            },
            "details": {
                "title": "文档详情",
                "openTooltip": "打开",
                "copyTooltip": "复制",
                "copySuccess": "已复制",
                "copyFailed": "复制失败",
            },
            "tableHeader": {
                "id": "ID",
                "summary": "摘要",
                "status": "状态",
                "length": "长度",
                "chunks": "分块",
                "created": "创建时间",
                "updated": "更新时间",
            },
            "noDocuments": "暂无文档",
            "noDocumentsDesc": "还没有上传任何文档。",
            "uploadDialog": {
                "title": "上传文档",
                "dropHint": "拖拽文件到此处",
                "formatHint": "支持 PDF、TXT、Markdown 等格式",
            },
            "deleteDialog": {
                "title": "删除文档",
                "description": "确定要删除选中的文档吗？此操作不可恢复。",
                "deleteFiles": "同时删除源文件",
                "deleteCache": "同时删除缓存",
            },
        },
        "selectDocuments": {
            "selectCurrentPage": "选择当前页 ({count})",
            "deselectAll": "取消全选 ({count})",
        },
    },
    "graphPanel": {
        "search": {
            "title": "搜索",
            "placeholder": "搜索节点...",
            "noResults": "无结果",
        },
        "graphLabels": {
            "title": "标签",
            "placeholder": "选择标签...",
            "allLabels": "所有标签",
        },
        "sideBar": {
            "graphControl": {
                "title": "图谱控制",
            },
            "fullScreenControl": {
                "fullScreen": "全屏",
                "windowed": "窗口模式",
            },
            "zoomControl": {
                "zoomIn": "放大",
                "zoomOut": "缩小",
                "reset": "重置视图",
            },
            "layoutControl": {
                "title": "布局",
                "random": "随机",
                "circle": "环形",
                "grid": "网格",
                "forceAtlas2": "力导向",
                "forceAtlas2Setting": "力导向设置",
            },
        },
        "legend": {
            "title": "图例",
            "entityCount": "个实体",
            "relationCount": "条关系",
            "noData": "暂无数据",
        },
        "propertiesView": {
            "title": "属性",
            "noSelection": "未选中节点",
            "noSelectionDesc": "点击图中的节点查看属性",
        },
        "settings": {
            "title": "设置",
        },
    },
    "retrievePanel": {
        "title": "检索查询",
        "retrieval": {
            "input": "输入查询...",
            "send": "发送",
            "clear": "清空",
            "stop": "停止",
            "error": "请求失败",
            "userTerminated": "用户已终止",
            "canceled": "已取消",
            "noHistory": "暂无历史记录",
        },
        "querySettings": {
            "title": "检索设置",
            "mode": "模式",
            "responseType": "回复类型",
            "historyTurns": "历史轮次",
            "stream": "流式输出",
            "userPrompt": "用户提示",
        },
        "chatMessage": {
            "thinking": "思考中...",
            "thinkingTime": "思考用时 {time} 秒",
            "thinkingInProgress": "思考进行中...",
        },
    },
}

def deep_update(d, u):
    for k, v in u.items():
        if k in d and isinstance(d[k], str) and isinstance(v, dict):
            continue  # Skip conflicts
        if isinstance(v, dict):
            if k not in d:
                d[k] = {}
            deep_update(d[k], v)
        else:
            d[k] = v
    return d

deep_update(zh, translations)

with open('src/locales/zh.json', 'w', encoding='utf-8') as f:
    json.dump(zh, f, ensure_ascii=False, indent=4)
    f.write('\n')

def count_leaves(d):
    c = 0
    for v in d.values():
        if isinstance(v, dict):
            c += count_leaves(v)
        else:
            c += 1
    return c

print(f'Updated zh.json - total entries: {count_leaves(zh)}')
