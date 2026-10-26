FROM composer:2 AS composer
FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql && a2enmod rewrite headers
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY . /var/www/html/
WORKDIR /var/www/html/backend
RUN composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction \
    && printf 'display_errors=Off\nlog_errors=On\npost_max_size=5M\nmemory_limit=128M\n' > /usr/local/etc/php/conf.d/aqualicious.ini
WORKDIR /var/www/html
