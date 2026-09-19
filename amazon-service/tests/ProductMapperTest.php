<?php

declare(strict_types=1);

namespace AutoPin\Amazon\Tests;

use AutoPin\Amazon\ProductMapper;
use DomainException;
use PHPUnit\Framework\TestCase;

final class ProductMapperTest extends TestCase
{
    public function testMapsOnlyTheRequiredProductFields(): void
    {
        $payload = ['itemsResult' => ['items' => [[
            'asin' => 'B09B2SBHQK',
            'detailPageURL' => 'https://www.amazon.com/dp/B09B2SBHQK?tag=wardiyan-20',
            'itemInfo' => ['title' => ['displayValue' => 'Example Product']],
            'images' => ['primary' => ['large' => ['url' => 'https://images.example/item.jpg']]],
        ]]]];

        self::assertSame([
            'asin' => 'B09B2SBHQK',
            'title' => 'Example Product',
            'detail_page_url' => 'https://www.amazon.com/dp/B09B2SBHQK?tag=wardiyan-20',
        ], ProductMapper::fromGetItems($payload, 'www.amazon.com'));
    }

    public function testRejectsAUrlOutsideTheSelectedMarketplace(): void
    {
        $this->expectException(DomainException::class);
        ProductMapper::fromGetItems(['itemsResult' => ['items' => [[
            'asin' => 'B09B2SBHQK',
            'detailPageURL' => 'https://evil.example/item',
            'itemInfo' => ['title' => ['displayValue' => 'Example Product']],
        ]]]], 'www.amazon.com');
    }
}
