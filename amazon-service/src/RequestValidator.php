<?php

declare(strict_types=1);

namespace AutoPin\Amazon;

use InvalidArgumentException;

final class RequestValidator
{
    private const MARKETPLACES = [
        'www.amazon.com', 'www.amazon.ca', 'www.amazon.com.mx', 'www.amazon.com.br',
        'www.amazon.co.uk', 'www.amazon.de', 'www.amazon.fr', 'www.amazon.it',
        'www.amazon.es', 'www.amazon.nl', 'www.amazon.com.be', 'www.amazon.ie',
        'www.amazon.pl', 'www.amazon.se', 'www.amazon.com.tr', 'www.amazon.eg',
        'www.amazon.in', 'www.amazon.sa', 'www.amazon.ae', 'www.amazon.co.jp',
        'www.amazon.sg', 'www.amazon.com.au',
    ];

    /** @param array<string, mixed> $input
     *  @return array{asin: string, marketplace: string, partner_tag: string}
     */
    public static function productLookup(array $input): array
    {
        $unexpected = array_diff(array_keys($input), ['asin', 'marketplace', 'partner_tag']);
        if ($unexpected !== []) {
            throw new InvalidArgumentException('unexpected_field');
        }
        $asin = strtoupper(trim(is_string($input['asin'] ?? null) ? $input['asin'] : ''));
        $marketplace = strtolower(trim(is_string($input['marketplace'] ?? null) ? $input['marketplace'] : ''));
        $partnerTag = trim(is_string($input['partner_tag'] ?? null) ? $input['partner_tag'] : '');

        if (!preg_match('/^[A-Z0-9]{10}$/D', $asin)) {
            throw new InvalidArgumentException('asin_invalid');
        }
        if (!in_array($marketplace, self::MARKETPLACES, true)) {
            throw new InvalidArgumentException('marketplace_invalid');
        }
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/D', $partnerTag)) {
            throw new InvalidArgumentException('partner_tag_invalid');
        }

        return ['asin' => $asin, 'marketplace' => $marketplace, 'partner_tag' => $partnerTag];
    }
}
