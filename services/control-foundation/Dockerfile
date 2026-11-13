FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY config/initial-master.json ./config/initial-master.json
ENV NODE_ENV=production ORIO_BIND_ADDRESS=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||'8080')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","src/server.ts"]
