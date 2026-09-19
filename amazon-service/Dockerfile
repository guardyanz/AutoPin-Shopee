FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader

FROM php:8.3-cli-alpine
RUN apk add --no-cache curl-dev oniguruma-dev \
    && docker-php-ext-install curl mbstring \
    && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY public ./public
COPY src ./src
RUN mkdir -p /app/var && chown -R app:app /app
USER app
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public", "public/index.php"]
