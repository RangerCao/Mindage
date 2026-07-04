import json, os

os.chdir(os.path.dirname(__file__) or '.')

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)
with open('src/locales/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)

def deep_ensure(d, u):
    """Add missing keys from u into d with Chinese translations."""
    for k, v in u.items():
        if isinstance(v, dict):
            if k not in d:
                d[k] = {}
            deep_ensure(d[k], v)
        elif k not in d:
            d[k] = v  # Copy English as fallback, will translate below

# First ensure all keys exist
deep_ensure(zh, en)

# Now translate the most important visible keys
translations = {
    # Graph panel
    "graphPanel": {
        "search": {
            "placeholder": "搜索节点...",
            "title": "搜索",
            "noResults": "无结果"
        },
        "graphLabels": {
            "title": "标签",
            "placeholder": "选择标签...",
            "allLabels": "所有标签",
            "searchPlaceholder": "搜索标签..."
        },
        "sideBar": {
            "graphControl": {
                "title": "图谱控制"
            },
            "fullScreenControl": {
                "fullScreen": "全屏",
                "windowed": "窗口模式"
            },
            "zoomControl": {
                "zoomIn": "放大",
                "zoomOut": "缩小",
                "reset": "重置"
            },
            "layoutControl": {
                "title": "布局",
                "random": "随机",
                "circle": "环形",
                "grid": "网格",
                "forceAtlas2": "力导向",
                "forceAtlas2Setting": "力导向设置",
                "linLog": "LinLog模式",
                "strongGravity": "强重力",
                "slowDown": "减速",
                "barnesHutOptimize": "Barnes-Hut优化",
                "updatePosition": "更新位置",
                "autoStop": "自动停止",
                "autoStopTime": "自动停止时间"
            }
        },
        "legend": {
            "title": "图例",
            "entityCount": "个实体",
            "relationCount": "条关系",
            "noData": "暂无数据"
        },
        "propertiesView": {
            "title": "属性",
            "noSelection": "未选中节点",
            "noSelectionDesc": "点击图中的节点查看属性",
            "entity": "实体",
            "relation": "关系",
            "source": "源节点",
            "target": "目标节点",
            "name": "名称",
            "value": "值",
            "description": "描述",
            "addProperty": "添加属性",
            "deleteProperty": "删除属性",
            "confirmDelete": "确认删除",
            "editProperty": "编辑属性",
            "errors": {
                "duplicateName": "名称已存在",
                "updateFailed": "更新失败",
                "mergeFailed": "合并失败",
                "updateSuccessButMergeFailed": "更新成功但合并失败"
            },
            "success": {
                "entityMerged": "实体已合并",
                "entityUpdated": "实体已更新",
                "relationUpdated": "关系已更新"
            },
            "mergeDialog": {
                "title": "合并实体",
                "message": "选择要合并的目标实体",
                "refreshing": "刷新中..."
            }
        },
        "settings": {
            "title": "图谱设置",
            "showNodeLabel": "显示节点标签",
            "showEdgeLabel": "显示边标签",
            "enableNodeDrag": "允许拖拽节点",
            "enableEdgeEvents": "启用边事件",
            "hideUnselectedEdges": "隐藏未选中边",
            "maxDepth": "最大深度",
            "maxNodes": "最大节点数",
            "minEdgeSize": "最小边尺寸",
            "maxEdgeSize": "最大边尺寸"
        },
        "loading": "加载图谱数据...",
        "switchingTheme": "切换主题中...",
        "noData": "暂无图谱数据",
        "error": "加载图谱失败"
    },

    # Document manager additional
    "documentManager": {
        "title": "文档管理",
        "uploadTitle": "上传文档",
        "clearTitle": "清空所有文档",
        "clearConfirm": "确定要清空所有文档吗？此操作不可恢复。",
        "deleteTitle": "删除文档",
        "deleteConfirm": "确定要删除选中的文档吗？",
        "deleteSuccess": "删除成功",
        "uploadSuccess": "上传成功",
        "pipelineTitle": "流水线状态",
        "scanTitle": "扫描新文档",
        "reprocessFailed": "重新处理失败文档",
        "filePreview": "文件预览",
        "trackId": "追踪ID",
        "errorMessage": "错误信息",
        "noDocuments": "暂无文档",
        "noDocumentsDesc": "还没有上传任何文档，点击上传按钮开始。",
        "uploadHint": "拖拽文件到此处或点击上传",
        "uploadFormat": "支持 PDF、TXT、Markdown 等格式",
        "filterAll": "全部",
        "filterCompleted": "已完成",
        "filterParsing": "解析中",
        "filterProcessing": "处理中",
        "filterFailed": "失败",
        "columnFileName": "文件名",
        "columnId": "ID",
        "columnSummary": "摘要",
        "columnStatus": "状态",
        "columnLength": "长度",
        "columnChunks": "分块",
        "columnCreated": "创建时间",
        "columnUpdated": "更新时间"
    },

    # Retrieval panel additional  
    "retrievePanel": {
        "retrieval": {
            "input": "输入查询...",
            "send": "发送",
            "clear": "清空",
            "stop": "停止",
            "error": "请求失败",
            "userTerminated": "用户已终止",
            "regenerate": "重新生成",
            "noHistory": "暂无历史记录",
            "clearHistory": "清空历史",
            "copy": "复制",
            "copied": "已复制",
            "canceled": "已取消"
        },
        "querySettings": {
            "title": "检索设置",
            "mode": "模式",
            "naive": "基础",
            "local": "本地",
            "global": "全局",
            "hybrid": "混合",
            "mix": "综合",
            "bypass": "旁路",
            "topK": "Top-K",
            "chunkTopK": "分块Top-K",
            "responseType": "回复类型",
            "responseTypes": {
                "singleParagraph": "单段落",
                "multipleParagraphs": "多段落",
                "bulletPoints": "要点"
            },
            "historyTurns": "历史轮次",
            "stream": "流式输出",
            "userPrompt": "用户提示",
            "maxTokens": "最大令牌数",
            "maxEntityTokens": "实体最大令牌",
            "maxRelationTokens": "关系最大令牌",
            "maxTotalTokens": "总最大令牌",
            "onlyNeedContext": "仅需上下文",
            "onlyNeedPrompt": "仅需提示",
            "enableRerank": "启用重排序",
            "conversationHistory": "对话历史",
            "advanced": "高级设置",
            "basic": "基本设置"
        },
        "chatMessage": {
            "thinking": "思考中...",
            "thinkingTime": "思考用时 {time} 秒",
            "thinkingInProgress": "思考进行中...",
            "userTerminated": "用户已终止"
        }
    }
}

def deep_update(d, u):
    for k, v in u.items():
        if k in d and isinstance(d[k], str) and isinstance(v, dict):
            # Conflict: existing is string, new is dict - skip or warn
            print(f'Warning: key "{k}" is string in zh, cannot update with dict')
            continue
        if isinstance(v, dict):
            if k not in d:
                d[k] = {}
            d[k] = deep_update(d.get(k, {}), v)
        else:
            d[k] = v
    return d

deep_update(zh, translations)

with open('src/locales/zh.json', 'w', encoding='utf-8') as f:
    json.dump(zh, f, ensure_ascii=False, indent=4)
    f.write('\n')

# Count total entries
def count_leaves(d):
    c = 0
    for v in d.values():
        if isinstance(v, dict):
            c += count_leaves(v)
        else:
            c += 1
    return c

print(f'Updated zh.json with {count_leaves(translations)} translated entries')
print(f'Total zh.json entries: {count_leaves(zh)}')
