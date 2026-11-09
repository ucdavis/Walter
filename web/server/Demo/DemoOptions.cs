namespace Server.Demo;

/// <summary>Enables fictional, read-only presentations in Development, Test, or Staging.</summary>
public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    public bool Enabled { get; set; }

    /// <summary>Entra object IDs permitted to present in deployed test environments. Development permits any signed-in, non-emulating user.</summary>
    public string[] AllowedPresenterIds { get; set; } = [];
}
