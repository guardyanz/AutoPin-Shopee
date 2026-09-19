<?php

declare(strict_types=1);

namespace AutoPin\Amazon;

use DomainException;

final class ProductMapper
{
    /** @param array<string, mixed> $payload
     *  @return array{asin: string, title: string, detail_page_url: string}
     */
    public static function fromGetItems(array $payload, string $marketplace): array
    {
        $items = $payload['itemsResult']['items'] ?? null;
        $item = is_array($items) && isset($items[0]) && is_array($items[0]) ? $items[0] : null;
        if ($item === null) {
            throw new DomainException('amazon_item_not_found');
        }

        $asin = strtoupper(trim(is_string($item['asin'] ?? null) ? $item['asin'] : ''));
        $titleValue = $item['itemInfo']['title']['displayValue'] ?? null;
        $title = trim(is_string($titleValue) ? $titleValue : '');
        $detailPageUrl = trim(is_string($item['detailPageURL'] ?? null) ? $item['detailPageURL'] : '');

        if (!preg_match('/^[A-Z0-9]{10}$/D', $asin) || $title === '' || mb_strlen($title) > 500) {
            throw new DomainException('amazon_item_invalid');
        }
        if (!self::isMarketplaceUrl($detailPageUrl, $marketplace)) {
            throw new DomainException('amazon_affiliate_url_invalid');
        }

        return ['asin' => $asin, 'title' => $title, 'detail_page_url' => $detailPageUrl];
    }

    private static function isMarketplaceUrl(string $value, string $marketplace): bool
    {
        $parts = parse_url($value);
        if (!is_array($parts) || ($parts['scheme'] ?? null) !== 'https') {
            return false;
        }
        $host = strtolower((string) ($parts['host'] ?? ''));
        return $host === $marketplace || str_ends_with($host, '.' . $marketplace);
    }
}
