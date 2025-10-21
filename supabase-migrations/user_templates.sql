-- Create user_templates table for Pro/Premium users to save edited templates
CREATE TABLE IF NOT EXISTS user_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Template metadata
    template_name VARCHAR(255) NOT NULL,
    original_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    category VARCHAR(100) DEFAULT 'custom',

    -- Content (rich text HTML)
    content TEXT NOT NULL,

    -- Metadata
    is_favorite BOOLEAN DEFAULT false,
    tags TEXT[], -- Array of tags for organization

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_edited_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT user_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_templates_user_id ON user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_created_at ON user_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_templates_category ON user_templates(category);

-- Enable Row Level Security
ALTER TABLE user_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can only see their own templates
CREATE POLICY "Users can view their own templates"
    ON user_templates
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own templates
CREATE POLICY "Users can create their own templates"
    ON user_templates
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own templates
CREATE POLICY "Users can update their own templates"
    ON user_templates
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own templates
CREATE POLICY "Users can delete their own templates"
    ON user_templates
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_edited_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update timestamps
CREATE TRIGGER trigger_update_user_templates_updated_at
    BEFORE UPDATE ON user_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_user_templates_updated_at();

-- Add comment to table
COMMENT ON TABLE user_templates IS 'Stores user-created and edited templates for Pro/Premium subscribers';
