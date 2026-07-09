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
    private readonly IReadOnlyList<FakeFinancialProject> _projects;

    public FakeFinancialApiService()
        : this(Array.Empty<string>()) { }

    public FakeFinancialApiService(IEnumerable<string> projectManagerEmployeeIds)
        : this(projectManagerEmployeeIds, null) { }

    public FakeFinancialApiService(
        IEnumerable<string> projectManagerEmployeeIds,
        IReadOnlyDictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>? projectTeamMembersByProjectNumber,
        IReadOnlyList<FakeFinancialProject>? projects = null)
    {
        _projectManagerEmployeeIds = new HashSet<string>(
            projectManagerEmployeeIds,
            StringComparer.OrdinalIgnoreCase);
        _projectTeamMembersByProjectNumber = projectTeamMembersByProjectNumber is null
            ? new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, IReadOnlyList<FakeFinancialProjectTeamMember>>(
                projectTeamMembersByProjectNumber,
                StringComparer.OrdinalIgnoreCase);
        _projects = projects ?? Array.Empty<FakeFinancialProject>();
    }

    public IAggieEnterpriseClient GetClient()
    {
        return ProxyFactory.CreateProxy<IAggieEnterpriseClient>((method, _) =>
        {
            if (method.Name == "get_PpmProjectByProjectTeamMemberEmployeeId")
            {
                return new FakePpmProjectByProjectTeamMemberEmployeeIdQuery(_projectManagerEmployeeIds, _projects);
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
    string EmployeeId,
    string? Email);

/// <summary>
/// A synthetic PPM project for <see cref="FakeFinancialApiService"/>. Award personnel model the
/// people on the project's awards (the real query matches team members OR award personnel).
/// </summary>
public sealed record FakeFinancialProject(
    string ProjectNumber,
    IReadOnlyList<FakeFinancialProjectTeamMember> TeamMembers,
    IReadOnlyList<FakeFinancialProjectTeamMember> AwardPersonnel);

internal sealed class FakePpmProjectByProjectTeamMemberEmployeeIdQuery : IPpmProjectByProjectTeamMemberEmployeeIdQuery
{
    private readonly ISet<string> _projectManagerEmployeeIds;
    private readonly IReadOnlyList<FakeFinancialProject> _projects;

    public FakePpmProjectByProjectTeamMemberEmployeeIdQuery(
        ISet<string> projectManagerEmployeeIds,
        IReadOnlyList<FakeFinancialProject> projects)
    {
        _projectManagerEmployeeIds = projectManagerEmployeeIds;
        _projects = projects;
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
        // Mirrors the real query: a project matches if the person has the role as a
        // project team member OR as award personnel (verified against the live API).
        var matchedProjects = _projects
            .Where(project =>
                project.TeamMembers.Concat(project.AwardPersonnel).Any(person =>
                    string.Equals(person.EmployeeId, employeeId, StringComparison.OrdinalIgnoreCase) &&
                    (roleName is null || string.Equals(person.RoleName, roleName, StringComparison.OrdinalIgnoreCase))))
            .Select(CreateProject);

        var isPmLookup = roleName == PpmRole.ProjectManager
            && _projectManagerEmployeeIds.Contains(employeeId);

        var projects = isPmLookup
            ? matchedProjects.Append(ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>(
                (_, _) => throw new NotImplementedException("Fake project items do not expose fields."))).ToArray()
            : matchedProjects.ToArray();

        var result = new PpmProjectByProjectTeamMemberEmployeeIdResult(projects);
        return Task.FromResult<IOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>>(
            new FakeOperationResult<IPpmProjectByProjectTeamMemberEmployeeIdResult>(result));
    }

    private static IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId CreateProject(
        FakeFinancialProject project)
    {
        var teamMembers = project.TeamMembers.Select(CreateTeamMember).ToArray();
        var awards = new[] { CreateAward(project.AwardPersonnel) };

        return ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId>((method, _) =>
            method.Name switch
            {
                "get_ProjectNumber" => project.ProjectNumber,
                "get_ProjectStatus" => "ACTIVE",
                "get_TeamMembers" => teamMembers,
                "get_Awards" => awards,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
    }

    private static IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_TeamMembers CreateTeamMember(
        FakeFinancialProjectTeamMember member)
    {
        return ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_TeamMembers>((method, _) =>
            method.Name switch
            {
                "get_EmployeeId" => member.EmployeeId,
                "get_Name" => member.Name,
                "get_RoleName" => member.RoleName,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
    }

    private static IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_Awards CreateAward(
        IReadOnlyList<FakeFinancialProjectTeamMember> personnel)
    {
        var awardPersonnel = personnel.Select(CreateAwardPerson).ToArray();

        return ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_Awards>((method, _) =>
            method.Name switch
            {
                "get_Personnel" => awardPersonnel,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
    }

    private static IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_Awards_Personnel CreateAwardPerson(
        FakeFinancialProjectTeamMember person)
    {
        return ProxyFactory.CreateProxy<IPpmProjectByProjectTeamMemberEmployeeId_PpmProjectByProjectTeamMemberEmployeeId_Awards_Personnel>((method, _) =>
            method.Name switch
            {
                "get_EmployeeId" => person.EmployeeId,
                "get_Name" => person.Name,
                "get_RoleName" => person.RoleName,
                _ => throw new NotImplementedException($"{method.Name} is not implemented for this fake."),
            });
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
                "get_EmployeeId" => member.EmployeeId,
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
