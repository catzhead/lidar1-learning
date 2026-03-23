"""Initial tables: datasets and jobs"""
revision = "001"
down_revision = None

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("point_count", sa.BigInteger(), nullable=True),
        sa.Column("crs", sa.String(), nullable=True),
        sa.Column("bounds", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="uploading"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dataset_id", sa.String(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("progress", sa.Float(), server_default="0.0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )

def downgrade():
    op.drop_table("jobs")
    op.drop_table("datasets")
