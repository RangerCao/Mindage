import json, os

os.chdir(os.path.dirname(__file__) or '.')

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)

# Translate the keys that are still English
fixes = {
    "documentPanel": {
        "documentManager": {
            "pipelineStatusButton": "流水线",
            "pipelineStatusTooltip": "查看流水线状态",
            "scanTooltip": "扫描新文档",
            "clearTooltip": "清空所有文档",
            "uploadTooltip": "上传文档",
            "uploadedTitle": "已上传文档",
            "emptyTitle": "暂无文档",
            "emptyDescription": "还没有上传任何文档。",
            "fileNameLabel": "文件名",
            "columns": {
                "id": "ID",
                "summary": "摘要",
                "status": "状态",
                "length": "长度",
                "chunks": "分块",
                "created": "创建时间",
                "updated": "更新时间",
                "fileName": "文件名"
            },
            "status": {
                "all": "全部",
                "completed": "已完成",
                "preprocessed": "预处理",
                "parsing": "解析中",
                "analyzing": "分析中",
                "processing": "处理中",
                "pending": "待处理",
                "failed": "失败",
            },
            "filter": {
                "all": "全部",
                "completed": "已完成",
                "parsing": "解析中",
                "analyzing": "分析中",
                "processing": "处理中",
                "pending": "待处理",
                "failed": "失败",
            },
            "details": {
                "title": "文档详情",
                "close": "关闭",
                "openTooltip": "打开",
                "copyTooltip": "复制",
                "copySuccess": "已复制",
                "copyFailed": "复制失败",
                "trackId": "追踪ID",
                "errorMessage": "错误信息",
            },
            "errors": {
                "loadFailed": "加载失败: {error}",
                "scanFailed": "扫描失败: {error}",
            },
        },
        "clearDocuments": {
            "title": "清空文档",
            "description": "确定要清空所有文档吗？此操作不可恢复。",
            "button": "清空",
            "confirmPlaceholder": "输入 yes 确认",
            "success": "清空成功",
            "failed": "清空失败",
            "confirmHint": "输入 yes 以确认",
        },
        "uploadDocuments": {
            "title": "上传文档",
            "button": "上传",
            "success": "上传成功",
            "failed": "上传失败",
            "processing": "处理中...",
            "fileUploader": {
                "title": "上传文档",
                "dropHint": "拖拽文件到此处",
                "formatHint": "支持 PDF、TXT、Markdown 等格式",
                "fileRejected": "文件被拒绝: {name}",
                "unsupportedType": "不支持的文件类型",
                "uploadSuccess": "上传成功",
                "uploadFailed": "上传失败",
            },
        },
        "pipelineStatus": {
            "title": "流水线状态",
            "close": "关闭",
            "noActive": "无活跃流水线",
            "jobName": "任务名称",
            "status": "状态",
            "startTime": "开始时间",
            "progress": "进度",
            "history": "历史记录",
            "noHistory": "暂无历史记录",
            "running": "运行中",
            "completed": "已完成",
            "failed": "失败",
        },
        "deleteDocuments": {
            "title": "删除文档",
            "description": "确定要删除选中的 {count} 个文档吗？",
            "button": "删除",
            "deleteFiles": "同时删除源文件",
            "deleteCache": "同时删除缓存",
            "success": "删除成功",
            "failed": "删除失败",
            "inProgress": "删除中...",
        },
        "selectDocuments": {
            "selectCurrentPage": "选择当前页 ({count})",
            "deselectAll": "取消全选 ({count})",
        },
    },
    "graphPanel": {
        "title": "知识图谱",
        "loading": "加载图谱数据...",
        "switchingTheme": "切换主题中...",
        "noData": "暂无图谱数据",
        "error": "加载图谱失败",
        "search": {
            "title": "搜索",
            "placeholder": "搜索节点..."
        },
        "graphLabels": {
            "title": "标签",
            "placeholder": "选择标签...",
            "allLabels": "所有标签",
        },
    },
}

def deep_update(d, u):
    for k, v in u.items():
        if isinstance(v, dict):
            if k not in d:
                d[k] = {}
            deep_update(d[k], v)
        else:
            d[k] = v
    return d

deep_update(zh, fixes)

with open('src/locales/zh.json', 'w', encoding='utf-8') as f:
    json.dump(zh, f, ensure_ascii=False, indent=4)
    f.write('\n')

print('Updated zh.json with Chinese translations')
