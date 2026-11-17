using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.core.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectionCreationKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CreationKey",
                table: "Projections",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections",
                columns: new[] { "PiEmployeeId", "CreationKey" },
                unique: true,
                filter: "[CreationKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections");

            migrationBuilder.DropColumn(
                name: "CreationKey",
                table: "Projections");
        }
    }
}
