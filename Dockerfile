# Dockerfile
# 基础镜像：轻量版Nginx
FROM nginx:alpine

# 维护者信息（可选）
LABEL maintainer="chencheng 3555670675@qq.com"

# 删除Nginx默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制自定义Nginx配置到镜像
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制Vue打包后的dist文件夹到Nginx的静态资源目录
COPY dist /usr/share/nginx/html

# 暴露80端口（容器对外提供服务的端口）
EXPOSE 80

# 启动Nginx（前台运行，避免容器退出）
CMD ["nginx", "-g", "daemon off;"]