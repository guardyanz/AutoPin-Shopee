<?php

declare(strict_types=1);

namespace AutoPin\Amazon\Tests;

use AutoPin\Amazon\RequestValidator;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class RequestValidatorTest extends TestCase
{
    public function testNormalizesAValidLookup(): void
    {
        self::assertSame(
            ['asin' => 'B09B2SBHQK', 'marketplace' => 'www.amazon.com', 'partner_tag' => 'wardiyan-20'],
            RequestValidator::productLookup([
                'asin' => 'b09b2sbhqk',
                'marketplace' => 'WWW.AMAZON.COM',
                'partner_tag' => 'wardiyan-20',
            ]),
        );
    }

    /** @dataProvider invalidLookups */
    public function testRejectsInvalidLookup(array $input): void
    {
        $this->expectException(InvalidArgumentException::class);
        RequestValidator::productLookup($input);
    }

    public function invalidLookups(): array
    {
        return [
            'asin' => [['asin' => 'bad', 'marketplace' => 'www.amazon.com', 'partner_tag' => 'wardiyan-20']],
            'marketplace' => [['asin' => 'B09B2SBHQK', 'marketplace' => 'evil.example', 'partner_tag' => 'wardiyan-20']],
            'tag' => [['asin' => 'B09B2SBHQK', 'marketplace' => 'www.amazon.com', 'partner_tag' => '../bad']],
            'unexpected field' => [['asin' => 'B09B2SBHQK', 'marketplace' => 'www.amazon.com', 'partner_tag' => 'wardiyan-20', 'image_url' => 'https://example.com/image.jpg']],
        ];
    }
}
