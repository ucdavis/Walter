using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.core.Migrations
{
    /// <inheritdoc />
    public partial class RenameProjectionSourcesAndAppointments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Projects",
                table: "Projections",
                newName: "FundingSources");

            migrationBuilder.RenameColumn(
                name: "Jobs",
                table: "Projections",
                newName: "Appointments");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "FundingSources",
                table: "Projections",
                newName: "Projects");

            migrationBuilder.RenameColumn(
                name: "Appointments",
                table: "Projections",
                newName: "Jobs");
        }
    }
}
