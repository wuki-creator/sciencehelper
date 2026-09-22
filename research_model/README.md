# PaperPilot 研究网络

运行时网络是 `DeepSeek -> Adapter1 -> K1` 和 `DeepSeek -> Adapter2 -> K2`。

Adapter1 使用 10,000 篇论文的 `title + conclusion -> subquestions` 标注训练，K1 将子问题约束到文献结构槽位：研究背景与假设、实验设计与方法、结果与证据解释、统计分析与可重复性、局限性与转化。Adapter2 使用 `title + Methods -> reagent requirements` 标注训练，K2 根据试剂目录和库存把需求路由到具体商品。

没有 adapter checkpoint 时，服务仍可启动：它调用云主机本地 vLLM 的 DeepSeek 模型，并用可解释的确定性 K1/K2 路由兜底。训练完成后设置 `ADAPTER1_PATH`、`ADAPTER2_PATH`，并按 `train.py` 输出的目录挂载即可。真正使用 LoRA 权重时，vLLM 也需要以 `--enable-lora --lora-modules adapter1=... adapter2=...` 重启；当前服务会继续暴露同一 HTTP 契约。

## 训练数据

Adapter1 每行 JSONL：

```json
{"title":"...", "conclusion":"...", "subquestions":[{"aspect":"实验设计与方法","route":"methods","question":"...","evidence":"both","confidence":0.9}]}
```

Adapter2 每行 JSONL：

```json
{"title":"...", "methods":"...", "requirements":[{"name":"RNA extraction kit","role":"RNA 提取","evidence":"Methods, line ...","confidence":0.95}]}
```

先从 PubMed/Europe PMC 收集开放全文候选（只下载真实全文，不生成合成结论）：

```bash
python -m research_model.prepare_data --collect-pubmed data/raw_pubmed.jsonl --expected 10000
```

然后由人工或审核流程补齐每行的 `reagents` 目录 ID、Methods 证据和（可选的）reviewed subquestions，再运行：

```bash
python -m research_model.prepare_data --input data/reviewed.jsonl --catalog data/reagent_catalog.json --output-dir data/prepared --expected 10000
python -m research_model.train_networks --adapter1-data data/prepared/train.jsonl --adapter2-data data/prepared/train.jsonl --catalog data/prepared/catalog.json --model /root/amazinglab/.models/DeepSeek-R1-Distill-Qwen-7B --output runs/research-network
```

脚本只训练 reviewed labels，不会替用户伪造论文结论、试剂货号或子问题。`train_networks.py --dry-run` 可先验证数据、论文级切分和目录覆盖，再加载 7B 模型。

## HTTP

`GET /health`、`GET /v1/model-info`、`POST /v1/k1`、`POST /v1/k2`、`POST /v1/pipeline`。`/v1/pipeline` 返回 `adapter1`、`k1`、`adapter2`、`k2` 四段结果，便于 Node 后端保留审计链。
