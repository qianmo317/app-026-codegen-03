# 戏曲演出提词器 —— 多阶段构建
# 构建：node:20-alpine；运行：nginx:1.27-alpine（只拷 dist/ 与 nginx 配置）

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行基座用 1.27-alpine-slim：完整版 1.27-alpine 自带 njs 动态模块（本机实测 78.2MB），
# 会超出 md §12「镜像 < 60MB」验收线；slim 为同一 nginx 1.27 的官方精简变体（约 21MB），
# 本配置仅用核心指令（gzip/try_files/add_header），无兼容性差异。
FROM nginx:1.27-alpine-slim
COPY nginx.default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
