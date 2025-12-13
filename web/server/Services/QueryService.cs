using System.Reflection;

namespace server.Services;

/// <summary>
/// Service for loading and caching SQL queries from embedded resources
/// </summary>
public static class QueryService
{
    private static readonly Dictionary<string, string> _queryCache = new();
    private static readonly object _lock = new();

    /// <summary>
    /// Gets a SQL query from embedded resources by name
    /// </summary>
    /// <param name="queryName">Name of the query file without .sql extension</param>
    /// <returns>The SQL query string</returns>
    /// <exception cref="FileNotFoundException">Thrown when query file is not found</exception>
    public static string GetQuery(string queryName)
    {
        lock (_lock)
        {
            if (_queryCache.TryGetValue(queryName, out var cachedQuery))
            {
                return cachedQuery;
            }

            var assembly = Assembly.GetExecutingAssembly();
            var resourceName = $"server.Queries.{queryName}.sql";

            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                throw new FileNotFoundException($"Query '{queryName}' not found in embedded resources. Expected resource name: {resourceName}");
            }

            using var reader = new StreamReader(stream);
            var query = reader.ReadToEnd();

            _queryCache[queryName] = query;
            return query;
        }
    }

    /// <summary>
    /// Formats a query with IN clause for a list of string values (safely escaped for OPENQUERY)
    /// </summary>
    /// <param name="queryName">Name of the query file without .sql extension</param>
    /// <param name="values">List of values to include in the IN clause</param>
    /// <returns>The formatted SQL query string</returns>
    public static string FormatQueryWithList(string queryName, IEnumerable<string> values)
    {
        var query = GetQuery(queryName);
        // Escape single quotes and wrap in quotes for SQL safety
        var quotedValues = string.Join(", ", values.Select(v => $"''{v.Replace("'", "''''''")}''"));
        return string.Format(query, quotedValues);
    }

    /// <summary>
    /// Clears the query cache (useful for testing)
    /// </summary>
    public static void ClearCache()
    {
        lock (_lock)
        {
            _queryCache.Clear();
        }
    }
}
