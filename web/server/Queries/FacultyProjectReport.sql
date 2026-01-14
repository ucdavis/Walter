-- Faculty Project Report
-- Returns detailed project information including budget, commitments, and expenditures
-- Parameters: @ProjectNumbers (list of project numbers)
SELECT *
FROM OPENQUERY(
    AE_Redshift_PROD,
    '
        SELECT
            PROJECT_NUMBER,
            PROJECT_NAME, PROJECT_STATUS_CODE,
            AWARD_NUMBER, AWARD_START_DATE, AWARD_END_DATE,
            PRJ_OWNING_ORG AS PROJECT_OWNING_ORG,
            TASK_NUM,
            TASK_NAME,
            TASK_STATUS,
            PM,
            PA,
            PI,
            COPI,
            EXPENDITURE_CATEGORY_NAME,
            FUND_DESC,
            PURPOSE_DESC,
            PROGRAM_DESC,
            ACTIVITY_DESC,
            CAT_BUDGET,
            CAT_COMMITMENTS,
            CAT_ITD_EXP,
            CAT_BUD_BAL
        FROM ae_dwh.ucd_faculty_rpt_t
        WHERE project_number IN ({0})
    '
);
