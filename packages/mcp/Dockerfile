# The ArchLang MCP server as a stdio container (Glama's build, the Docker MCP Catalog).
# Build context: packages/mcp. It installs the published @chanmeng666/archlang-mcp at the version in
# this directory's package.json, so the image matches the npm release cut from the same commit; it
# does not build from source.
#   docker build -t archlang-mcp packages/mcp
#   docker run -i --rm archlang-mcp

FROM node:22-alpine AS install
WORKDIR /app
COPY package.json /tmp/archlang-mcp-package.json
RUN version="$(node -p "require('/tmp/archlang-mcp-package.json').version")" \
  && npm install --omit=dev --no-audit --no-fund --no-package-lock "@chanmeng666/archlang-mcp@${version}" \
  && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
USER node
ENTRYPOINT ["/app/node_modules/.bin/archlang-mcp"]
