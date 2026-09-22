# DeepSeek + Adapter + K 网络

`ml/` 是 PaperPilot 的独立模型服务和训练骨架，不改变现有 `server.js`。网络分成四个职责：

* **DeepSeek + Adapter1**：从论文标题生成结构化的研究证据/结论；
* **K1**：按常见文献结构把证据拆成「研究问题、实验设计、结果结论、局限性」子问题；
* **Adapter2**：接收标题和 Methods，抽取可采购的试剂语义；
* **K2**：按实验环节将试剂问题路由到 RNA 提取、逆转录、qPCR、建库等类别，后续可替换为真实商城 SKU 检索。

## 1. 准备数据

输入支持 `.jsonl` 和 `.csv`。字段名可以是英文或中文，至少需要 `title`；建议提供 `conclusion`、`methods`、`reagents`。数组可以直接用 JSON 数组，也可以用分号/换行分隔。

```bash
python ml/prepare_dataset.py --input papers.jsonl --output-dir ml/data
```

输出 `normalized.*.jsonl`、`adapter1.*.jsonl`、`adapter2.*.jsonl` 和 `manifest.json`。当数据没有 K1/K2 人工标注时，脚本生成可追溯的 IMRaD 结构化弱标签；结论和 Methods 只来自输入，不补写实验事实。

## 2. CPU 验证和训练

无 GPU 或尚未安装训练依赖时，先做 dry-run：

```bash
python ml/train_adapters.py --data-dir ml/data --dry-run
```

训练机安装 `ml/requirements.txt`（PyTorch 请按 CUDA 版本选择官方 wheel），再分别训练四个 LoRA 目录：

```bash
python ml/train_adapters.py --data-dir ml/data --output-dir ml/artifacts \
  --base-model deepseek-ai/DeepSeek-R1-Distill-Qwen-7B \
  --jobs adapter1 k1 adapter2 k2
```

实际 10,000 篇标题训练前，建议先用 `--max-length`、小样本和 `--jobs adapter1` 做显存/吞吐检查。训练产物不要提交到 Git，应通过对象存储或部署镜像挂载到服务主机。

## 3. 启动模型服务

```bash
pip install -r ml/requirements.txt
ML_PORT=8010 ML_ARTIFACTS_DIR=/opt/paperpilot/ml/artifacts \
  uvicorn ml.model_service:app --host 0.0.0.0 --port 8010
```

探活：`GET /healthz`。OpenAI 兼容接口：`POST /v1/chat/completions`，请求体使用 `model` 和 `messages`。网络接口：

* `POST /route/k1`：`{"title":"...", "conclusion":"...", "methods":["..."]}`；
* `POST /route/k2`：`{"title":"...", "methods":["..."], "reagents":["..."]}`；
* `POST /pipeline`：一次返回 K1 子问题和 K2 试剂路由；
* `GET /v1/models`：返回服务和已发现的 adapter 目录。

没有配置 `DEEPSEEK_API_KEY` 或本地模型时，K1/K2 仍可用规则路由，聊天接口返回可审计的 JSON 骨架。配置 `DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` 和 `DEEPSEEK_API_KEY` 后，聊天接口会调用 DeepSeek；本地 LoRA 加载通过 `ML_ENABLE_LOCAL_MODEL=true` 开启。

## 4. 云端部署注意事项

SSH、API key 和模型权重不要写入仓库或 systemd 文件，使用云平台 secret/env 注入。建议让 Nginx/网关只暴露 `GET /healthz` 和经过认证的 `/v1/*`，并将 `ML_PORT` 绑定到内网；Node 的现有 API 可以通过内网 URL 调用 `/pipeline`。
