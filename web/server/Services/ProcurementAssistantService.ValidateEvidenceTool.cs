using System.Text.Json;

namespace Server.Services;

public sealed partial class ProcurementAssistantService
{
    private Task<ProcurementAgentToolExecutionOutcome> ValidateEvidenceToolAsync(
        JsonElement arguments,
        IList<ProcurementToolCallTrace> traceCalls,
        ProcurementEvidenceCatalog evidenceCatalog)
    {
        var candidateSetIds = ReadStringArray(arguments, "candidateSetIds");
        if (candidateSetIds.Count == 0)
        {
            return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
            {
                error = "candidateSetIds must contain at least one candidate set.",
            }));
        }

        var candidateSets = new List<ProcurementCandidateSet>();
        foreach (var candidateSetId in candidateSetIds)
        {
            if (!evidenceCatalog.TryGetCandidateSet(candidateSetId, out var candidateSet))
            {
                return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(new
                {
                    error = $"Unknown candidate set `{candidateSetId}`.",
                }));
            }

            candidateSets.Add(candidateSet);
        }

        var assessment = ProcurementEvidenceValidator.Validate(
            evidenceCatalog.CreateAssessmentId(),
            candidateSets,
            ProcurementSearchSpecFactory.ReadOptionalString(arguments, "focus"),
            ProcurementSearchSpecFactory.ReadOptionalString(arguments, "expectedEntityType") ?? "unknown");
        evidenceCatalog.StoreAssessment(assessment);

        var payloadJson = SerializeToolResult(assessment);
        traceCalls.Add(ProcurementTraceFactory.BuildSyntheticToolTrace(
            "validate_evidence",
            assessment.Focus,
            candidateSetIds,
            "Walter validated whether the retrieved candidates were strong enough to treat as evidence.",
            payloadJson));

        return Task.FromResult(ProcurementAgentToolExecutionOutcome.ToolResult(assessment));
    }
}
