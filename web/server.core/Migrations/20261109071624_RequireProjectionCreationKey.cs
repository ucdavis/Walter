using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.core.Migrations
{
    /// <inheritdoc />
    public partial class RequireProjectionCreationKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections");

            migrationBuilder.AlterColumn<Guid>(
                name: "CreationKey",
                table: "Projections",
                type: "uniqueidentifier",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections",
                columns: new[] { "PiEmployeeId", "CreationKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections");

            migrationBuilder.AlterColumn<Guid>(
                name: "CreationKey",
                table: "Projections",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.CreateIndex(
                name: "IX_Projections_PiEmployeeId_CreationKey",
                table: "Projections",
                columns: new[] { "PiEmployeeId", "CreationKey" },
                unique: true,
                filter: "[CreationKey] IS NOT NULL");
        }
    }
}
