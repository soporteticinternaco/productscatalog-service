/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type ProductSearchResult = {
    id?: string;
    ref?: string;
    ean?: string;
    containerUnits?: string;
    containerType?: string;
    supplierId?: string;
    supplierName?: string;
    step?: number;
    description?: string;
    shortDescription?: string;
    mainPictureUrl?: string;
    mainPictureThumbUrl?: string;
    level1?: string;
    level2?: string;
    level3?: string;
    level1Name?: string;
    level2Name?: string;
    level3Name?: string;
    discount1?: number;
    discount2?: number;
    netPrice?: number;
    salePrice?: number;
    netPriceWithMargin?: number;
    vatAmount?: number;
    /**
     * True when the search term exactly matched one of this product's deprecated `replaces` references.
     */
    isReplacementOf?: boolean;
    /**
     * When grouping is enabled, other products collapsed under the same grouping_code.
     */
    groupedItems?: Array<ProductSearchResult>;
};

