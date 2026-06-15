using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using server.core.Data;
using server.core.Domain;

namespace server.core.Services;

public interface IGLReconciliationInclusionsService
{
    Task<IReadOnlyList<GLReconciliationInclusion>> GetInclusionsAsync(CancellationToken ct = default);
    Task<GLReconciliationInclusion> AddInclusionAsync(string asn, string? note, string createdBy, CancellationToken ct = default);
    Task<bool> RemoveInclusionAsync(string asn, CancellationToken ct = default);
}

public sealed class GLReconciliationInclusionsService : IGLReconciliationInclusionsService
{
    private static readonly Regex AsnPattern = new(@"^\d{1,20}$", RegexOptions.Compiled);
    private readonly AppDbContext _db;

    public GLReconciliationInclusionsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<GLReconciliationInclusion>> GetInclusionsAsync(CancellationToken ct = default)
    {
        return await _db.GLReconciliationInclusions
            .OrderBy(x => x.AccountingSequenceNumber)
            .ToListAsync(ct);
    }

    public async Task<GLReconciliationInclusion> AddInclusionAsync(
        string asn, string? note, string createdBy, CancellationToken ct = default)
    {
        var normalizedAsn = asn?.Trim() ?? "";
        if (!AsnPattern.IsMatch(normalizedAsn))
            throw new ArgumentException("ASN must be 1–20 digits.", nameof(asn));

        if (await _db.GLReconciliationInclusions.AnyAsync(x => x.AccountingSequenceNumber == normalizedAsn, ct))
            throw new InvalidOperationException($"ASN '{normalizedAsn}' is already in the inclusion list.");

        var inclusion = new GLReconciliationInclusion
        {
            AccountingSequenceNumber = normalizedAsn,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            CreatedBy = createdBy,
            CreatedOnUtc = DateTime.UtcNow,
        };

        _db.GLReconciliationInclusions.Add(inclusion);
        await _db.SaveChangesAsync(ct);
        return inclusion;
    }

    public async Task<bool> RemoveInclusionAsync(string asn, CancellationToken ct = default)
    {
        var normalizedAsn = asn?.Trim() ?? "";
        var inclusion = await _db.GLReconciliationInclusions
            .FirstOrDefaultAsync(x => x.AccountingSequenceNumber == normalizedAsn, ct);

        if (inclusion is null)
            return false;

        _db.GLReconciliationInclusions.Remove(inclusion);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
