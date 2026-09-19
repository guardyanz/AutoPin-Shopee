<?php

declare(strict_types=1);

namespace AutoPin\Amazon;

use Amazon\CreatorsAPI\v1\Configuration;
use Amazon\CreatorsAPI\v1\com\amazon\creators\model\GetItemsRequestContent;
use Amazon\CreatorsAPI\v1\com\amazon\creators\model\GetItemsResource;

final class AmazonCreatorsClient
{
    private readonly CachedDefaultApi $api;

    public function __construct(string $credentialId, string $credentialSecret, string $version, string $cachePath)
    {
        $configuration = new Configuration();
        $configuration->setCredentialId($credentialId);
        $configuration->setCredentialSecret($credentialSecret);
        $configuration->setVersion($version);
        $this->api = new CachedDefaultApi($cachePath, null, $configuration);
    }

    /** @return array<string, mixed> */
    public function getItem(string $asin, string $marketplace, string $partnerTag): array
    {
        $request = new GetItemsRequestContent();
        $request->setPartnerTag($partnerTag);
        $request->setItemIds([$asin]);
        $request->setResources([GetItemsResource::ITEM_INFO_TITLE]);
        $response = $this->api->getItems($marketplace, $request);
        $payload = json_decode(json_encode($response, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        return is_array($payload) ? $payload : [];
    }
}
