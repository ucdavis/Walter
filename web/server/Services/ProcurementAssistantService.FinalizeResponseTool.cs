using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private Task<ProcurementAgentToolExecutionOutcome> FinalizeResponseToolAsync(
        JsonElement arguments,
        string question,
        IReadOnlyList<string> expansions,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog,
        IReadOnlyList<ProcurementAggregateArtifact> aggregateArtifacts,
        bool includeTrace)
    {
        try
        {
            var finalArgs = JsonSerializer.Deserialize<ProcurementFinalResponseArguments>(
                arguments.GetRawText(),
                JsonOptions);

            if (finalArgs is null ||
                string.IsNullOrWhiteSpace(finalArgs.AnswerText) ||
                string.IsNullOrWhiteSpace(finalArgs.Intent) ||
                string.IsNullOrWhiteSpace(finalArgs.FinalAnswerSource))
            {
                return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = "answerText, intent, and finalAnswerSource are required.",
                }));
            }

            var inferredFindings = ProcurementEvidenceValidator.BuildDefaultFindings(evidenceCatalog.EvidenceAssessments);
            var confidence = string.IsNullOrWhiteSpace(finalArgs.Confidence)
                ? inferredFindings.OverallConfidence
                : finalArgs.Confidence.Trim();
            var fallbackCharts = SelectFallbackCharts(finalArgs.Charts, aggregateArtifacts);
            var auditSummaryNotes = fallbackCharts.Count == finalArgs.Charts.Count
                ? finalArgs.AuditSummaryNotes
                : finalArgs.AuditSummaryNotes
                    .Append("Walter auto-included anchored aggregate chart output because the final response omitted charts.")
                    .ToArray();
            var response = new ProcurementAssistantResponse
            {
                AnswerText = finalArgs.AnswerText.Trim(),
                AuditSummary = ProcurementTraceFactory.BuildAuditSummary(
                    question,
                    confidence,
                    finalArgs.Intent.Trim(),
                    finalArgs.Entity?.Type ?? finalArgs.EntityType ?? "unknown",
                    finalArgs.Entity?.Value,
                    traceCalls,
                    finalArgs.FinalAnswerSource.Trim(),
                    auditSummaryNotes),
                Charts = fallbackCharts,
                Confidence = confidence,
                ConfirmedFindings = finalArgs.ConfirmedFindings.Count == 0
                    ? inferredFindings.ConfirmedFindings
                    : finalArgs.ConfirmedFindings,
                Entity = finalArgs.Entity,
                ExploratoryFindings = finalArgs.ExploratoryFindings.Count == 0
                    ? inferredFindings.ExploratoryFindings
                    : finalArgs.ExploratoryFindings,
                Intent = finalArgs.Intent.Trim(),
                IsConfigured = true,
                Question = question,
                SummaryCards = finalArgs.SummaryCards ?? [],
                SupportingFindings = finalArgs.SupportingFindings.Count == 0
                    ? inferredFindings.SupportingFindings
                    : finalArgs.SupportingFindings,
                SupportingTable = finalArgs.SupportingTable,
                Trace = includeTrace
                    ? ProcurementTraceFactory.BuildTracePayload(
                        question,
                        finalArgs.Intent.Trim(),
                        finalArgs.Entity?.Type ?? finalArgs.EntityType ?? "unknown",
                        finalArgs.Entity?.Value,
                        expansions,
                        evidenceCatalog.EvidenceAssessments,
                        traceCalls,
                        finalArgs.FinalAnswerSource.Trim())
                    : null,
            };

            return Task.FromResult(ProcurementAgentToolExecutionOutcome.Final(response));
        }
        catch (JsonException ex)
        {
            return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = $"Could not parse finalize_response arguments: {ex.Message}",
            }));
        }
    }
}
