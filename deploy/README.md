# 部署说明

GPU 主机运行 vLLM（DeepSeek-R1-Distill-Qwen-7B，8000）和研究网络（8091）；PaperPilot Node 后端监听 3010。没有训练产物时研究网络返回 `adapter.loaded=false`，仍可用 DeepSeek 提示词和可解释路由；训练完成后把 `runs/research-network/manifest.json` 写入 `NETWORK_MANIFEST`，并设置 `ADAPTER1_PATH` / `ADAPTER2_PATH`。

已有 `www.cellbubble.cn` 后端继续使用 `/opt/paperpilot` 的 Node 服务和 Nginx `/paperpilot/` 路径。该低配主机只负责 Web/API；GPU 研究服务不复制 7B 权重到低配机。两台机器之间需要将 `RESEARCH_MODEL_URL` 配置为 GPU 研究服务的可达内网地址，或通过 SSH 反向隧道暴露 8091；否则 Node 会安全地回退到现有 DeepSeek/fallback 实现。
