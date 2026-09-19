<?php

declare(strict_types=1);

use AutoPin\Amazon\AmazonCreatorsClient;
use AutoPin\Amazon\ProductMapper;
use AutoPin\Amazon\RequestValidator;

require dirname(__DIR__) . '/vendor/autoload.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
applyCors();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';

try {
    if ($method === 'GET' && $path === '/health') {
        respond(200, ['status' => 'ok', 'service' => 'autopin-amazon-service', 'sdk' => 'tims/amazon-creatorsapi-php-sdk']);
    }
    if ($method !== 'POST' || $path !== '/v1/product-lookups') {
        respondError(404, 'not_found', 'Route not found');
    }

    requireServiceToken();
    enforceRateLimit();
    $contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        respondError(415, 'content_type_invalid', 'Content-Type must be application/json');
    }
    $body = file_get_contents('php://input', false, null, 0, 16_385);
    if ($body === false || strlen($body) > 16_384) {
        respondError(413, 'payload_too_large', 'Request body exceeds 16 KiB');
    }
    $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($input)) {
        respondError(400, 'json_invalid', 'Request body must be a JSON object');
    }
    $validated = RequestValidator::productLookup($input);
    $client = new AmazonCreatorsClient(
        requiredEnvironment('AMAZON_CREDENTIAL_ID'),
        requiredEnvironment('AMAZON_CREDENTIAL_SECRET'),
        requiredEnvironment('AMAZON_CREDENTIAL_VERSION'),
        getenv('TOKEN_CACHE_PATH') ?: '/tmp/autopin-amazon-token.json',
    );
    $payload = $client->getItem($validated['asin'], $validated['marketplace'], $validated['partner_tag']);
    $item = ProductMapper::fromGetItems($payload, $validated['marketplace']);
    respond(200, [
        'data' => ['item' => $item],
        'meta' => [
            'marketplace' => $validated['marketplace'],
            'fetched_at' => gmdate(DATE_ATOM),
            'cache' => 'no-store',
        ],
    ]);
} catch (JsonException) {
    respondError(400, 'json_invalid', 'Request body must be valid JSON');
} catch (InvalidArgumentException $exception) {
    respondError(422, $exception->getMessage(), 'Request validation failed');
} catch (DomainException $exception) {
    $status = $exception->getMessage() === 'amazon_item_not_found' ? 404 : 502;
    respondError($status, $exception->getMessage(), 'Amazon did not return a usable item');
} catch (Throwable $exception) {
    error_log(sprintf('amazon_service_error class=%s code=%s', $exception::class, (string) $exception->getCode()));
    respondError(502, 'amazon_upstream_error', 'Amazon Creators API request failed');
}

function applyCors(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if (preg_match('/^chrome-extension:\/\/[a-p]{32}$/D', $origin) || in_array($origin, ['http://localhost:5173', 'http://127.0.0.1:5173'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

function requireServiceToken(): void
{
    $expected = requiredEnvironment('AMAZON_SERVICE_TOKEN');
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $provided = str_starts_with($authorization, 'Bearer ') ? substr($authorization, 7) : '';
    if (strlen($expected) < 32 || !hash_equals($expected, $provided)) {
        respondError(401, 'unauthorized', 'Valid Bearer service token required');
    }
}

function enforceRateLimit(): void
{
    $path = sys_get_temp_dir() . '/autopin-amazon-rate-limit';
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        throw new RuntimeException('Unable to enforce rate limit');
    }
    try {
        $last = (float) trim((string) stream_get_contents($handle));
        $now = microtime(true);
        if ($last > 0 && $now - $last < 1.05) {
            respondError(429, 'rate_limited', 'Wait before requesting another Amazon item');
        }
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, sprintf('%.6f', $now));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function requiredEnvironment(string $name): string
{
    $value = trim((string) getenv($name));
    if ($value === '') {
        throw new RuntimeException('Service configuration is incomplete');
    }
    return $value;
}

/** @param array<string, mixed> $payload */
function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function respondError(int $status, string $code, string $message): never
{
    respond($status, ['error' => ['code' => $code, 'message' => $message]]);
}
