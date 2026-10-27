using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.core.Migrations
{
    /// <inheritdoc />
    public partial class AddProjections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Projections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PiEmployeeId = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HistoryMonths = table.Column<int>(type: "int", nullable: false),
                    SeededAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionJobs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionId = table.Column<int>(type: "int", nullable: false),
                    EmployeeId = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    PositionNumber = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    JobCode = table.Column<string>(type: "nvarchar(6)", maxLength: 6, nullable: true),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RateSet = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    MonthlySalary = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    Fte = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: false),
                    CbrRate = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    VacationAccrualRate = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: false),
                    ColaRate = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: false),
                    ColaMonth = table.Column<int>(type: "int", nullable: false),
                    FeeRemissionMonthly = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsSeeded = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionJobs_Projections_ProjectionId",
                        column: x => x.ProjectionId,
                        principalTable: "Projections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionProjects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionId = table.Column<int>(type: "int", nullable: false),
                    ProjectNumber = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    TaskNumber = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    TaskName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    ProjectName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ProjectType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    AwardNumber = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    AwardName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsSeeded = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionProjects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionProjects_Projections_ProjectionId",
                        column: x => x.ProjectionId,
                        principalTable: "Projections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionActuals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionProjectId = table.Column<int>(type: "int", nullable: false),
                    Month = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpenditureCategory = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionActuals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionActuals_ProjectionProjects_ProjectionProjectId",
                        column: x => x.ProjectionProjectId,
                        principalTable: "ProjectionProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionBudgets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionProjectId = table.Column<int>(type: "int", nullable: false),
                    ExpenditureCategory = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Budget = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SpentToDate = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Committed = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IsSeeded = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionBudgets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionBudgets_ProjectionProjects_ProjectionProjectId",
                        column: x => x.ProjectionProjectId,
                        principalTable: "ProjectionProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionExpenses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionProjectId = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ExpenditureCategory = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    StartMonth = table.Column<DateOnly>(type: "date", nullable: true),
                    EndMonth = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionExpenses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionExpenses_ProjectionProjects_ProjectionProjectId",
                        column: x => x.ProjectionProjectId,
                        principalTable: "ProjectionProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectionFundingEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionJobId = table.Column<int>(type: "int", nullable: false),
                    ProjectionProjectId = table.Column<int>(type: "int", nullable: true),
                    Percent = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsSeeded = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionFundingEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionFundingEntries_ProjectionJobs_ProjectionJobId",
                        column: x => x.ProjectionJobId,
                        principalTable: "ProjectionJobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectionFundingEntries_ProjectionProjects_ProjectionProjectId",
                        column: x => x.ProjectionProjectId,
                        principalTable: "ProjectionProjects",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ProjectionRunRates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProjectionProjectId = table.Column<int>(type: "int", nullable: false),
                    ExpenditureCategory = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HistoryMonths = table.Column<int>(type: "int", nullable: false),
                    MonthlyAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectionRunRates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectionRunRates_ProjectionProjects_ProjectionProjectId",
                        column: x => x.ProjectionProjectId,
                        principalTable: "ProjectionProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionActuals_ProjectionProjectId",
                table: "ProjectionActuals",
                column: "ProjectionProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionBudgets_ProjectionProjectId_ExpenditureCategory",
                table: "ProjectionBudgets",
                columns: new[] { "ProjectionProjectId", "ExpenditureCategory" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionExpenses_ProjectionProjectId",
                table: "ProjectionExpenses",
                column: "ProjectionProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionFundingEntries_ProjectionJobId",
                table: "ProjectionFundingEntries",
                column: "ProjectionJobId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionFundingEntries_ProjectionProjectId",
                table: "ProjectionFundingEntries",
                column: "ProjectionProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionJobs_ProjectionId",
                table: "ProjectionJobs",
                column: "ProjectionId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionProjects_ProjectionId",
                table: "ProjectionProjects",
                column: "ProjectionId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectionRunRates_ProjectionProjectId",
                table: "ProjectionRunRates",
                column: "ProjectionProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Projections_PiEmployeeId",
                table: "Projections",
                column: "PiEmployeeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectionActuals");

            migrationBuilder.DropTable(
                name: "ProjectionBudgets");

            migrationBuilder.DropTable(
                name: "ProjectionExpenses");

            migrationBuilder.DropTable(
                name: "ProjectionFundingEntries");

            migrationBuilder.DropTable(
                name: "ProjectionRunRates");

            migrationBuilder.DropTable(
                name: "ProjectionJobs");

            migrationBuilder.DropTable(
                name: "ProjectionProjects");

            migrationBuilder.DropTable(
                name: "Projections");
        }
    }
}
