/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type GetCategoriesTreeRequest = {
    /**
     * Tenant identifier
     */
    tenantId: string;
    /**
     * List of supplier IDs
     */
    supplierIds: Array<string>;
    visibility?: number;
    /**
     * Language code
     */
    lang: GetCategoriesTreeRequest.lang;
};

export namespace GetCategoriesTreeRequest {

    /**
     * Language code
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

