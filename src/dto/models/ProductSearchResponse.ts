/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ProductSearchResult } from './ProductSearchResult';

export type ProductSearchResponse = {
    navigation?: {
        total?: number;
        page?: number;
        limit?: number;
        count?: number;
        firstPage?: string;
        lastPage?: string;
        previousPage?: string | null;
        nextPage?: string | null;
    };
    data?: Array<ProductSearchResult>;
};

