FROM oven/bun:1 AS base

WORKDIR /usr/src/app

FROM base AS install

RUN mkdir -p /temp/dev /temp/prod
COPY package.json bun.lock /temp/dev/
COPY package.json bun.lock /temp/prod/
RUN cd /temp/dev && bun install --frozen-lockfile
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease

COPY --from=install /temp/dev/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun test

FROM prerelease AS release

ENV NODE_ENV=production
ENV PORT=3000

RUN rm -rf ./node_modules
COPY --chown=bun:bun --from=install /temp/prod/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock tsconfig.json ./
COPY --chown=bun:bun src ./src

USER bun

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
