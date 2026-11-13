using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.core.Migrations
{
    /// <inheritdoc />
    public partial class ConsolidateProjectionContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Content",
                table: "Projections",
                type: "nvarchar(max)",
                nullable: false);

            migrationBuilder.DropColumn(
                name: "Appointments",
                table: "Projections");

            migrationBuilder.DropColumn(
                name: "HistoryMonths",
                table: "Projections");

            migrationBuilder.DropColumn(
                name: "FundingSources",
                table: "Projections");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FundingSources",
                table: "Projections",
                type: "nvarchar(max)",
                nullable: false);

            migrationBuilder.AddColumn<string>(
                name: "Appointments",
                table: "Projections",
                type: "nvarchar(max)",
                nullable: false);

            migrationBuilder.AddColumn<int>(
                name: "HistoryMonths",
                table: "Projections",
                type: "int",
                nullable: false);

            migrationBuilder.DropColumn(
                name: "Content",
                table: "Projections");
        }
    }
}
