/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type SearchProductsRequest = {
    /**
     * Search query
     */
    'q'?: string;
    /**
     * Language code to search in (defaults to 'es')
     */
    lang?: SearchProductsRequest.lang;
    /**
     * Supplier id
     */
    supplierId?: string;
    /**
     * Comma separated product refs
     */
    ref?: string;
    /**
     * Comma separated product eans
     */
    ean?: string;
    /**
     * Comma separated Level1 cat ids
     */
    l1Id?: string;
    /**
     * Comma separated Level2 cat ids
     */
    l2Id?: string;
    /**
     * Comma separated Level3 cat ids
     */
    l3Id?: string;
    /**
     * Comma separated product ids
     */
    id?: string;
    /**
     * Client visibility
     */
    visibility?: number;
    /**
     * Sort by field; suffix with `+`/`-` for direction (e.g. `price+`)
     */
    sortBy?: string;
    /**
     * Product type
     */
    type?: string;
    /**
     * Group products by grouping_code
     */
    grouping?: boolean;
    /**
     * Product rate id
     */
    rate?: string;
};

export namespace SearchProductsRequest {

    /**
     * Language code to search in (defaults to 'es')
     */
    export enum lang {
        CA = 'ca',
        EN = 'en',
        ES = 'es',
        FR = 'fr',
        GL = 'gl',
        PT = 'pt',
    }


}

