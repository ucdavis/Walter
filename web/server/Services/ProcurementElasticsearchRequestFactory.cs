using Microsoft.Extensions.Options;

namespace Server.Services;

internal sealed class ProcurementElasticsearchRequestFactory
{
    private readonly ProcurementAssistantOptions _options;

    public ProcurementElasticsearchRequestFactory(IOptions<ProcurementAssistantOptions> options)
    {
        _options = options.Value;
    }

    public object BuildSupplierSearchPayload(ProcurementSupplierSearchSpec spec)
    {
        return new
        {
            query = BuildSupplierQuery(
                spec.QueryText,
                spec.ExpandedQueries,
                spec.Filters,
                spec.EnableFuzzyMatching),
            size = spec.Size,
        };
    }

    public object BuildLineSearchPayload(ProcurementLineSearchSpec spec)
    {
        var payload = new Dictionary<string, object?>
        {
            ["query"] = BuildLineQuery(
                spec.QueryText,
                spec.ExpandedQueries,
                spec.Filters,
                spec.IncludeCategoryFields,
                spec.IncludeSupplierFields,
                spec.EnableFuzzyMatching),
            ["size"] = spec.Size,
        };

        if (spec.SortByAmountDescending)
        {
            payload["sort"] = new object[]
            {
                new Dictionary<string, object?>
                {
                    [_options.LineAmountField] = new
                    {
                        order = "desc",
                        unmapped_type = "double",
                    },
                },
            };
        }

        return payload;
    }

    public object BuildItemGroupSearchPayload(ProcurementItemGroupSearchSpec spec)
    {
        return new
        {
            query = BuildItemGroupQuery(
                spec.QueryText,
                spec.ExpandedQueries,
                spec.Filters,
                spec.IncludeCategoryFields,
                spec.EnableFuzzyMatching),
            size = spec.Size,
        };
    }

    public object BuildSemanticSearchPayload(
        int size,
        string embeddingField,
        IReadOnlyList<float> embeddingVector)
    {
        return new
        {
            knn = new
            {
                field = embeddingField,
                k = Math.Max(size, 8),
                num_candidates = Math.Max(size * 4, 25),
                query_vector = embeddingVector,
            },
            size,
        };
    }

    public object BuildSpendAggregationPayload(
        ProcurementAggregationRequest request,
        bool useItemGroupIndex)
    {
        return new
        {
            aggs = BuildAggregations(request, useItemGroupIndex),
            query = useItemGroupIndex
                ? BuildItemGroupQuery(
                    request.QueryText,
                    request.ExpandedQueries,
                    request.Filters,
                    request.IncludeCategoryFields,
                    request.EnableFuzzyMatching)
                : BuildLineQuery(
                    request.QueryText,
                    request.ExpandedQueries,
                    request.Filters,
                    request.IncludeCategoryFields,
                    request.IncludeSupplierFields,
                    request.EnableFuzzyMatching),
            size = 0,
            track_total_hits = true,
        };
    }

    private object BuildSupplierQuery(
        string queryText,
        IReadOnlyList<string> expandedQueries,
        IReadOnlyDictionary<string, string> filters,
        bool enableFuzzyMatching)
    {
        var should = new List<object>();
        var phrases = expandedQueries
            .Append(queryText)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var phrase in phrases)
        {
            should.Add(enableFuzzyMatching
                ? new
                {
                    multi_match = new
                    {
                        fields = new[]
                        {
                            $"{_options.SupplierNameField}^6",
                            $"{_options.SupplierNameNormField}^8",
                            $"{_options.SupplierAliasField}^7",
                            $"{_options.SupplierTermsField}^2",
                            $"{_options.SupplierCategoriesField}^2",
                        },
                        fuzziness = "AUTO",
                        query = phrase,
                        type = "best_fields",
                    },
                }
                : new
                {
                    multi_match = new
                    {
                        fields = new[]
                        {
                            $"{_options.SupplierNameField}^6",
                            $"{_options.SupplierNameNormField}^8",
                            $"{_options.SupplierAliasField}^7",
                            $"{_options.SupplierTermsField}^2",
                            $"{_options.SupplierCategoriesField}^2",
                        },
                        @operator = "and",
                        query = phrase,
                        type = "best_fields",
                    },
                });

            should.Add(new
            {
                match_phrase = new Dictionary<string, object?>
                {
                    [_options.SupplierNameNormField] = new
                    {
                        boost = 12,
                        query = ProcurementQueryText.Normalize(phrase),
                    },
                },
            });

            should.Add(new
            {
                match_phrase = new Dictionary<string, object?>
                {
                    [_options.SupplierAliasField] = new
                    {
                        boost = 10,
                        query = phrase,
                    },
                },
            });
        }

        if (should.Count == 0 && filters.Count == 0)
        {
            return new { match_all = new { } };
        }

        return new
        {
            @bool = new
            {
                filter = BuildFilters(filters),
                minimum_should_match = should.Count > 0 ? 1 : 0,
                should,
            },
        };
    }

    private object BuildLineQuery(
        string queryText,
        IReadOnlyList<string> expandedQueries,
        IReadOnlyDictionary<string, string> filters,
        bool includeCategoryFields,
        bool includeSupplierFields,
        bool enableFuzzyMatching)
    {
        var should = new List<object>();
        var phrases = expandedQueries
            .Append(queryText)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var phrase in phrases)
        {
            var fields = new List<string>
            {
                $"{_options.ItemDescriptionField}^6",
                $"{_options.ItemDescriptionNormField}^7",
                $"{_options.PurchaseOrderDescriptionField}^4",
                $"{_options.PurchaseOrderDescriptionNormField}^5",
            };

            if (includeSupplierFields)
            {
                fields.Add($"{_options.SupplierNameField}^2");
                fields.Add($"{_options.SupplierNameNormField}^3");
            }

            if (includeCategoryFields)
            {
                fields.Add($"{_options.CategoryNameField}^2");
                fields.Add($"{_options.CategoryNameNormField}^3");
            }

            should.Add(enableFuzzyMatching
                ? new
                {
                    multi_match = new
                    {
                        fields,
                        fuzziness = "AUTO",
                        query = phrase,
                        type = "best_fields",
                    },
                }
                : new
                {
                    multi_match = new
                    {
                        fields,
                        @operator = "and",
                        query = phrase,
                        type = "best_fields",
                    },
                });

            should.Add(new
            {
                match_phrase = new Dictionary<string, object?>
                {
                    [_options.ItemDescriptionNormField] = new
                    {
                        boost = 8,
                        query = ProcurementQueryText.Normalize(phrase),
                    },
                },
            });

            should.Add(new
            {
                match_phrase = new Dictionary<string, object?>
                {
                    [_options.PurchaseOrderDescriptionNormField] = new
                    {
                        boost = 6,
                        query = ProcurementQueryText.Normalize(phrase),
                    },
                },
            });

            if (includeCategoryFields)
            {
                var normalizedPhrase = ProcurementQueryText.Normalize(phrase);
                var compactNormalizedPhrase = ProcurementQueryText.NormalizeCompacted(phrase);

                should.Add(new
                {
                    match_phrase = new Dictionary<string, object?>
                    {
                        [_options.CategoryNameNormField] = new
                        {
                            boost = 7,
                            query = normalizedPhrase,
                        },
                    },
                });

                if (!string.Equals(compactNormalizedPhrase, normalizedPhrase, StringComparison.Ordinal))
                {
                    should.Add(new
                    {
                        match_phrase = new Dictionary<string, object?>
                        {
                            [_options.CategoryNameNormField] = new
                            {
                                boost = 9,
                                query = compactNormalizedPhrase,
                            },
                        },
                    });
                }

                should.Add(new
                {
                    match_phrase = new Dictionary<string, object?>
                    {
                        [_options.CategoryCodeField] = new
                        {
                            boost = 10,
                            query = compactNormalizedPhrase,
                        },
                    },
                });
            }
        }

        if (should.Count == 0 && filters.Count == 0)
        {
            return new { match_all = new { } };
        }

        return new
        {
            @bool = new
            {
                filter = BuildFilters(filters),
                minimum_should_match = should.Count > 0 ? 1 : 0,
                should,
            },
        };
    }

    private object BuildItemGroupQuery(
        string queryText,
        IReadOnlyList<string> expandedQueries,
        IReadOnlyDictionary<string, string> filters,
        bool includeCategoryFields,
        bool enableFuzzyMatching)
    {
        var should = new List<object>();
        var phrases = expandedQueries
            .Append(queryText)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var phrase in phrases)
        {
            var fields = new List<string>
            {
                $"{_options.ItemGroupNameField}^7",
                $"{_options.ItemGroupNameNormField}^8",
                $"{_options.ItemGroupDescriptionField}^5",
                $"{_options.ItemGroupVectorTextField}^4",
            };

            if (includeCategoryFields)
            {
                fields.Add($"{_options.CategoryNameField}^2");
                fields.Add($"{_options.CategoryNameNormField}^3");
            }

            should.Add(enableFuzzyMatching
                ? new
                {
                    multi_match = new
                    {
                        fields,
                        fuzziness = "AUTO",
                        query = phrase,
                        type = "best_fields",
                    },
                }
                : new
                {
                    multi_match = new
                    {
                        fields,
                        @operator = "and",
                        query = phrase,
                        type = "best_fields",
                    },
                });

            var normalizedPhrase = ProcurementQueryText.Normalize(phrase);

            should.Add(new
            {
                match_phrase = new Dictionary<string, object?>
                {
                    [_options.ItemGroupNameNormField] = new
                    {
                        boost = 10,
                        query = normalizedPhrase,
                    },
                },
            });

            if (!string.IsNullOrWhiteSpace(_options.ItemGroupDescriptionNormField) &&
                !string.Equals(
                    _options.ItemGroupDescriptionNormField,
                    _options.ItemGroupNameNormField,
                    StringComparison.OrdinalIgnoreCase))
            {
                should.Add(new
                {
                    match_phrase = new Dictionary<string, object?>
                    {
                        [_options.ItemGroupDescriptionNormField] = new
                        {
                            boost = 7,
                            query = normalizedPhrase,
                        },
                    },
                });
            }

            if (includeCategoryFields)
            {
                should.Add(new
                {
                    match_phrase = new Dictionary<string, object?>
                    {
                        [_options.CategoryNameNormField] = new
                        {
                            boost = 6,
                            query = normalizedPhrase,
                        },
                    },
                });
            }
        }

        if (should.Count == 0 && filters.Count == 0)
        {
            return new { match_all = new { } };
        }

        return new
        {
            @bool = new
            {
                filter = BuildFilters(filters),
                minimum_should_match = should.Count > 0 ? 1 : 0,
                should,
            },
        };
    }

    private object BuildAggregations(ProcurementAggregationRequest request, bool useItemGroupIndex)
    {
        var amountField = useItemGroupIndex ? _options.ItemGroupAmountField : _options.LineAmountField;
        if (string.Equals(request.BucketType, "month", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object?>
            {
                ["sum_amount"] = new { sum = new { field = _options.LineAmountField } },
                ["terms_bucket"] = new
                {
                    date_histogram = new
                    {
                        calendar_interval = "month",
                        field = _options.DateField,
                        min_doc_count = 1,
                    },
                    aggs = new
                    {
                        sum_amount = new { sum = new { field = _options.LineAmountField } },
                    },
                },
            };
        }

        var termsField = string.Equals(request.BucketType, "supplier", StringComparison.OrdinalIgnoreCase)
            ? _options.SupplierTermsAggregationField
            : _options.CategoryTermsAggregationField;
        var aggregations = new Dictionary<string, object?>
        {
            ["sum_amount"] = new { sum = new { field = amountField } },
            ["terms_bucket"] = new Dictionary<string, object?>
            {
                ["terms"] = new
                {
                    field = termsField,
                    order = new Dictionary<string, string> { ["sum_amount"] = "desc" },
                    size = request.Size,
                },
                ["aggs"] = BuildBucketMetricAggregations(amountField, useItemGroupIndex),
            },
        };

        if (useItemGroupIndex)
        {
            aggregations["sum_line_count"] = new { sum = new { field = _options.ItemGroupLineCountField } };
        }

        return aggregations;
    }

    private object BuildBucketMetricAggregations(string amountField, bool useItemGroupIndex)
    {
        var aggregations = new Dictionary<string, object?>
        {
            ["sum_amount"] = new { sum = new { field = amountField } },
        };

        if (useItemGroupIndex)
        {
            aggregations["sum_line_count"] = new { sum = new { field = _options.ItemGroupLineCountField } };
        }

        return aggregations;
    }

    private static IReadOnlyList<object> BuildFilters(IReadOnlyDictionary<string, string> filters)
    {
        return filters
            .Where(kvp => !string.IsNullOrWhiteSpace(kvp.Value))
            .Select(kvp => (object)new Dictionary<string, object?>
            {
                ["term"] = new Dictionary<string, object?>
                {
                    [kvp.Key] = kvp.Value,
                },
            })
            .ToArray();
    }
}
