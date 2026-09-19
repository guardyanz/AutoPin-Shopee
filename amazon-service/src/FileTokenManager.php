<?php

declare(strict_types=1);

namespace AutoPin\Amazon;

use Amazon\CreatorsAPI\v1\com\amazon\creators\auth\OAuth2Config;
use Amazon\CreatorsAPI\v1\com\amazon\creators\auth\OAuth2TokenManager;
use GuzzleHttp\Client;
use RuntimeException;

final class FileTokenManager extends OAuth2TokenManager
{
    public function __construct(private readonly OAuth2Config $oauthConfig, private readonly string $cachePath)
    {
        parent::__construct($oauthConfig);
    }

    public function getToken(): string
    {
        $directory = dirname($this->cachePath);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create token cache directory');
        }
        $lock = fopen($this->cachePath . '.lock', 'c+');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            throw new RuntimeException('Unable to lock token cache');
        }
        try {
            $cached = $this->readCache();
            if ($cached !== null && $cached['expires_at'] > time() + 30) {
                return $cached['access_token'];
            }
            $client = new Client(['timeout' => 15]);
            $parameters = [
                'grant_type' => $this->oauthConfig->getGrantType(),
                'client_id' => $this->oauthConfig->getClientId(),
                'client_secret' => $this->oauthConfig->getClientSecret(),
                'scope' => $this->oauthConfig->getScope(),
            ];
            $options = $this->oauthConfig->isLwa() ? ['json' => $parameters] : ['form_params' => $parameters];
            $response = $client->post($this->oauthConfig->getTokenEndpoint(), $options);
            $payload = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($payload) || !is_string($payload['access_token'] ?? null)) {
                throw new RuntimeException('Amazon returned no access token');
            }
            $expiresAt = time() + max(60, (int) ($payload['expires_in'] ?? 3600)) - 30;
            $this->writeCache($payload['access_token'], $expiresAt);
            return $payload['access_token'];
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @return array{access_token: string, expires_at: int}|null */
    private function readCache(): ?array
    {
        if (!is_file($this->cachePath)) {
            return null;
        }
        $payload = json_decode((string) file_get_contents($this->cachePath), true);
        if (!is_array($payload) || !is_string($payload['access_token'] ?? null) || !is_int($payload['expires_at'] ?? null)) {
            return null;
        }
        return ['access_token' => $payload['access_token'], 'expires_at' => $payload['expires_at']];
    }

    private function writeCache(string $accessToken, int $expiresAt): void
    {
        $temporary = $this->cachePath . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $encoded = json_encode(['access_token' => $accessToken, 'expires_at' => $expiresAt], JSON_THROW_ON_ERROR);
        if (file_put_contents($temporary, $encoded, LOCK_EX) === false) {
            throw new RuntimeException('Unable to write token cache');
        }
        chmod($temporary, 0600);
        if (!rename($temporary, $this->cachePath)) {
            @unlink($temporary);
            throw new RuntimeException('Unable to replace token cache');
        }
    }
}
