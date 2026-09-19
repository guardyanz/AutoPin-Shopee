<?php

declare(strict_types=1);

namespace AutoPin\Amazon;

use Amazon\CreatorsAPI\v1\com\amazon\creators\api\DefaultApi;
use Amazon\CreatorsAPI\v1\com\amazon\creators\auth\OAuth2Config;
use Amazon\CreatorsAPI\v1\com\amazon\creators\auth\OAuth2TokenManager;

final class CachedDefaultApi extends DefaultApi
{
    public function __construct(private readonly string $tokenCachePath, ...$arguments)
    {
        parent::__construct(...$arguments);
    }

    protected function createTokenManager(OAuth2Config $oauthConfig): OAuth2TokenManager
    {
        return new FileTokenManager($oauthConfig, $this->tokenCachePath);
    }
}
