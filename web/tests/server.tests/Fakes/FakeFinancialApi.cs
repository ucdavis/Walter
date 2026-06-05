using System.Reflection;
using AggieEnterpriseApi;
using server.Helpers;
using server.Services;
using StrawberryShake;

namespace server.tests.Fakes;

/// <summary>
/// Test double for <see cref="IFinancialApiService"/>. Seed PM employee IDs via the constructor;
/// the fake GraphQL client reports those as ProjectManager on exactly one synthetic project.
/// </summary>
public sealed class FakeFinancialApiService : IFinancialApiService
{
    private readonly HashSet<string> _projectManagerEmployeeIds;
    private readonly Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>> _projectTeamMembersByProjectNumber;

    public FakeFinancialApiService()
        : this(Array.Empty<string>()) { }

    public FakeFinancialApiService(IEnumerable<string> projectManagerEmployeeIds)
        : this(projectManagerEmployeeIds, null) { }

    public FakeFinancialApiService(
        IEnumerable<string> projectManagerEmployeeIds,
        IReadOnlyDictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>? projectTeamMembersByProjectNumber)
    {
        _projectManagerEmployeeIds = new HashSet<string>(
            projectManagerEmployeeIds,
            StringComparer.OrdinalIgnoreCase);
        _projectTeamMembersByProjectNumber = projectTeamMembersByProjectNumber is null
            ? new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>(
                projectTeamMembersByProjectNumber,
                StringComparer.OrdinalIgnoreCase);
    }

    public IAggieEnterpriseClient GetClient()
    {
        return ProxyFactory.CreateProxy<IAggieEnterpriseClient>((method, _) =>
        {
            if (method.Name == "get_PpmProjectByProjectTeamMemberEmployeeId")
            {
                return new FakePpmProjectByProjectTeamMemberEmployeeIdQuery(_projectManagerEmployeeIds);
            }

            if (method.Name == "get_PpmProjectTeamMembers")
            {
                return new FakePpmProjectTeamMembersQuery(_projectTeamMembersByProjectNumber);
            }

            throw new NotImplementedException($"{method.Name} is not implemented for this fake.");
        });
    }
}

public sealed record FakeFinancialProjectTeamMember(
    string RoleName,
    string Name,
    string? Email);

internal sealed class FakePpmProjectByProjectTeamMemberEmployeeIdQuery : IPpmProjectByProjectTeamMemberEmployeeIdQuery
{
    private readonly ISet<string> _projectManagerEmployeeIds;

    public FakePpmProjectByProjectTeamMemberEmployeeIdQuery(ISet<string> projectManagerEmployeeIds)
    {
        _projectManagerEmployeeIds = projectManagerEmployeeIds;
    }

    public Type ResultType => typeof(IPpmProjectByProjectTeamMemberEmployeeIdResult);

    public OperationRequest Create(IReadOnlyDictionary<string, object?>? variables)
    {
        return new OperationRequest(
            "FakePpmProjectByProjectTeamMemberEmployeeId",
            ProxyFactory.CreateProxy<IDocument>((_, _) => throw new NotImplementedException()),
            variables ?? new Dictionary<string, object?>(),
            new Dictionary<string, Upload?>(),
            default);
    }

    public Task<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>> ExecuteAsync(
        string employeeId,
        string? roleName,
        CancellationToken cancellationToken)
    {
        var isPmLookup = roleName == PpmRole.ProjectManager
            && _projectManagerEmployeeIds.Contains(employeeId);

        var projects = isPmLookup
            ? new[] { ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>(
                (_, _) => throw new NotImplementedException("Fake project items do not expose fields.")) }
            : Array.Empty<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>();

        var result = new PpmProjectByProjectTeamMemberEmployeeIdResult(projects);
        return Task.FromResult<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>>(
            new FakeOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>(result));
    }

    public IObservable<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>> Watch(
        string employeeId,
        string? roleName,
        ExecutionStrategy? strategy = null)
    {
        throw new NotImplementedException();
    }
}

internal sealed class FakePpmProjectTeamMembersQuery : IPpmProjectTeamMembersQuery
{
    private readonly IReadOnlyDictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>> _projectTeamMembersByProjectNumber;

    public FakePpmProjectTeamMembersQuery(
        IReadOnlyDictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>> projectTeamMembersByProjectNumber)
    {
        _projectTeamMembersByProjectNumber = projectTeamMembersByProjectNumber;
    }

    public Type ResultType => typeof(IPpmProjectTeamMembersResult);

    public OperationRequest Create(IReadOnlyDictionary<string, object?>? variables)
    {
        return new OperationRequest(
            "FakePpmProjectTeamMembers",
            ProxyFactory.CreateProxy<IDocument>((_, _) => throw new NotImplementedException()),
            variables ?? new Dictionary<string, object?>(),
            new Dictionary<string, Upload?>(),
            default);
    }

    public Task<IOperationResult<IPpmProjectTeamMembersResult>> ExecuteAsync(
        string projectNumber,
        string? roleName,
        CancellationToken cancellationToken)
    {
        _projectTeamMembersByProjectNumber.TryGetValue(projectNumber, out var allMembers);
        var members = (allMembers ?? [])
            .Where(member => roleName is null || string.Equals(member.RoleName, roleName, StringComparison.OrdinalIgnoreCase))
            .Select(CreateTeamMember)
            .ToArray();

        var project = ProxyFactory.CreateProxy<IPpmProjectTeamMembers_PpmProjectByNumber>((method, _) =>
            method.Name switch
            {
                "get_TeamMembers" => members,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
        var result = ProxyFactory.CreateProxy<IPpmProjectTeamMembersResult>((method, _) =>
            method.Name switch
            {
                "get_PpmProjectByNumber" => project,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });

        return Task.FromResult<IOperationResult<IPpmProjectTeamMembersResult>>(
            new FakeOperationResult<IPpmProjectTeamMembersResult>(result));
    }

    public IObservable<IOperationResult<IPpmProjectTeamMembersResult>> Watch(
        string projectNumber,
        string? roleName,
        ExecutionStrategy? strategy = null)
    {
        throw new NotImplementedException();
    }

    private static IPpmProjectTeamMembers_PpmProjectByNumber_TeamMembers CreateTeamMember(
        FakeFinancialProjectTeamMember member)
    {
        var person = ProxyFactory.CreateProxy<IPpmProjectTeamMembers_PpmProjectByNumber_TeamMembers_Person>((method, _) =>
            method.Name switch
            {
                "get_Email" => member.Email,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });

        return ProxyFactory.CreateProxy<IPpmProjectTeamMembers_PpmProjectByNumber_TeamMembers>((method, _) =>
            method.Name switch
            {
                "get_Name" => member.Name,
                "get_Person" => person,
                "get_RoleName" => member.RoleName,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
    }
}

internal sealed class FakeOperationResult<TResultData> : IOperationResult<TResultData>
    where TResultData : class
{
    public FakeOperationResult(TResultData data)
    {
        Data = data;
    }

    public TResultData Data { get; }

    public IOperationResultDataFactory<TResultData> DataFactory => null!;

    object IOperationResult.Data => Data!;

    object IOperationResult.DataFactory => DataFactory;

    public IOperationResultDataInfo DataInfo => null!;

    public Type DataType => typeof(TResultData);

    public IReadOnlyList<IClientError> Errors => Array.Empty<IClientError>();

    public IReadOnlyDictionary<string, object?> Extensions => new Dictionary<string, object?>();

    public IReadOnlyDictionary<string, object?> ContextData => new Dictionary<string, object?>();

    public IOperationResult<TResultData> WithData(TResultData data, IOperationResultDataInfo dataInfo)
    {
        return new FakeOperationResult<TResultData>(data);
    }
}

internal static class ProxyFactory
{
    public static T CreateProxy<T>(Func<MethodInfo, object?[]?, object?> handler) where T : class
    {
        var proxy = DispatchProxy.Create<T, InterfaceProxy<T>>();
        ((InterfaceProxy<T>)(object)proxy).Handler = handler;
        return proxy;
    }

    private class InterfaceProxy<T> : DispatchProxy where T : class
    {
        public Func<MethodInfo, object?[]?, object?>? Handler { get; set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod == null || Handler == null)
            {
                throw new NotImplementedException();
            }

            return Handler(targetMethod, args);
        }
    }
}
