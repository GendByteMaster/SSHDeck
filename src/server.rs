#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Server {
    pub alias: String,
}

impl Server {
    pub fn new(alias: impl Into<String>) -> Self {
        Self {
            alias: alias.into(),
        }
    }
}
