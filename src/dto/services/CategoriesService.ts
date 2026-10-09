/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CategoriesTreeRequest } from '../models/CategoriesTreeRequest';
import type { GetCategoriesTreeResponse } from '../models/GetCategoriesTreeResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class CategoriesService {

    /**
     * Get categories tree for suppliers
     * Returns a hierarchical tree of categories (level1 → level2 → level3) for the given supplier IDs, localized by the requested language.
     * @param tenantId Tenant identifier
     * @param lang Language code
     * @param type Product type
     * @param supplierIds Comma separated supplier ids
     * @param l1Id Comma separated Level1 cat ids
     * @param l2Id Comma separated Level2 cat ids
     * @param l3Id Comma separated Level3 cat ids
     * @param visibility Client visibility
     * @param deleted Include deleted products. If not set, only non-deleted are returned.
     * @returns GetCategoriesTreeResponse Hierarchical categories tree
     * @throws ApiError
     */
    public static getTenantsCategoriesTree(
        tenantId: string,
        lang: 'ca' | 'en' | 'es' | 'fr' | 'gl' | 'pt' = 'es',
        type: string = 'edp',
        supplierIds?: string,
        l1Id?: string,
        l2Id?: string,
        l3Id?: string,
        visibility?: number,
        deleted?: boolean,
    ): CancelablePromise<GetCategoriesTreeResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tenants/{tenantId}/categories-tree',
            path: {
                'tenantId': tenantId,
            },
            query: {
                'lang': lang,
                'type': type,
                'supplierIds': supplierIds,
                'l1Id': l1Id,
                'l2Id': l2Id,
                'l3Id': l3Id,
                'visibility': visibility,
                'deleted': deleted,
            },
        });
    }

    /**
     * Get categories tree for suppliers (query params passed in the request body)
     * @param tenantId Tenant identifier
     * @param requestBody
     * @returns GetCategoriesTreeResponse Hierarchical categories tree
     * @throws ApiError
     */
    public static postTenantsCategoriesTree(
        tenantId: string,
        requestBody?: CategoriesTreeRequest,
    ): CancelablePromise<GetCategoriesTreeResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/tenants/{tenantId}/categories-tree',
            path: {
                'tenantId': tenantId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }

}
