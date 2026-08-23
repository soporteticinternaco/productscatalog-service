/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
     * @param supplierIds Comma separated supplier ids
     * @param visibility Client visibility
     * @param deleted Include deleted products. If not set, only non-deleted are returned.
     * @returns GetCategoriesTreeResponse Hierarchical categories tree
     * @throws ApiError
     */
    public static getTenantsCategoriesTree(
        tenantId: string,
        lang: 'ca' | 'en' | 'es' | 'fr' | 'gl' | 'pt' = 'es',
        supplierIds?: string,
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
                'supplierIds': supplierIds,
                'visibility': visibility,
                'deleted': deleted,
            },
        });
    }

}
